const pool = require('../config/db');
const letterImageService = require('./letterImageService');
const { LETTER_MAX_IMAGES } = require('../utils/letterUpload');

// Ảnh kèm ba lời chúc riêng của một bạn nằm ở bảng wish_images (migration 025),
// có thứ tự, tối đa 4 ảnh mỗi loại. Cột students.<loại>_image_url /
// _image_public_id luôn được giữ = ảnh đầu, để code cũ và snapshot cũ vẫn hiện
// được một ảnh.

// Tên cột cố định theo loại, không bao giờ lấy từ dữ liệu người gửi
const WISH_IMAGE_COLUMNS = Object.freeze({
  intro: ['intro_image_url', 'intro_image_public_id'],
  admin_wish: ['admin_wish_image_url', 'admin_wish_image_public_id'],
  greeting: ['greeting_image_url', 'greeting_image_public_id'],
});
const WISH_KINDS = Object.keys(WISH_IMAGE_COLUMNS);

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function isMissingTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

function wishImageColumns(kind) {
  const columns = WISH_IMAGE_COLUMNS[kind];
  if (!columns) throw httpError('Loại lời chúc không hợp lệ (intro, admin_wish hoặc greeting)', 400);
  return columns;
}

const NEEDS_MIGRATION = 'Máy chủ chưa hỗ trợ nhiều ảnh cho lời chúc riêng (cần chạy npm run migrate)';

// studentIds → Map(studentId → { intro: [...], admin_wish: [...], greeting: [...] }),
// mỗi ảnh { id, url }. Máy chưa migrate thì null
async function imagesForStudents(studentIds) {
  if (!studentIds.length) return new Map();
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT id, student_id, kind, image_url FROM wish_images
       WHERE student_id IN (${studentIds.map(() => '?').join(',')})
       ORDER BY student_id, kind, position, id`,
      studentIds,
    );
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  const byStudent = new Map();
  for (const row of rows) {
    if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, {});
    const kinds = byStudent.get(row.student_id);
    (kinds[row.kind] ||= []).push({ id: row.id, url: row.image_url });
  }
  return byStudent;
}

// Gắn intro_images / admin_wish_images / greeting_images vào từng bạn; loại
// nào chưa có dòng ở bảng mới thì lấy ảnh ở cột cũ (nếu có)
async function withWishImages(students) {
  const list = students.filter(Boolean);
  if (!list.length) return students;
  const byStudent = await imagesForStudents(list.map((student) => student.id));
  return students.map((student) => {
    if (!student) return student;
    const kinds = byStudent?.get(student.id) || {};
    const extra = {};
    for (const kind of WISH_KINDS) {
      const [urlColumn] = WISH_IMAGE_COLUMNS[kind];
      extra[`${kind}_images`] = kinds[kind] || (student[urlColumn] ? [{ id: null, url: student[urlColumn] }] : []);
    }
    return { ...student, ...extra };
  });
}

// Cột cũ = ảnh đầu hiện tại (hoặc NULL khi hết ảnh)
async function syncMirror(executor, studentId, kind) {
  const [urlColumn, publicIdColumn] = wishImageColumns(kind);
  const [rows] = await executor.execute(
    'SELECT image_url, public_id FROM wish_images WHERE student_id = ? AND kind = ? ORDER BY position, id LIMIT 1',
    [studentId, kind],
  );
  await executor.execute(
    `UPDATE students SET ${urlColumn} = ?, ${publicIdColumn} = ? WHERE id = ?`,
    [rows[0]?.image_url || null, rows[0]?.public_id || null, studentId],
  );
}

async function inTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    if (isMissingTable(error)) throw httpError(NEEDS_MIGRATION, 503);
    throw error;
  } finally {
    connection.release();
  }
}

async function lockStudent(connection, studentId) {
  const [rows] = await connection.execute('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  if (!rows.length) throw httpError('Không tìm thấy học sinh', 404);
}

// images: [{ url, publicId }] vừa upload, thêm vào cuối. Tổng quá 4 thì từ chối
// (người gọi dọn ảnh vừa upload)
async function addWishImages(studentId, kind, images) {
  const [urlColumn, publicIdColumn] = wishImageColumns(kind);
  if (!images.length) throw httpError('Chọn ít nhất một ảnh để tải lên', 400);
  await inTransaction(async (connection) => {
    await lockStudent(connection, studentId);
    // Ảnh chỉ nằm ở cột cũ (gắn bằng bản chưa cập nhật) mà bảng chưa có dòng
    // nào: đưa nó vào làm ảnh đầu, kẻo syncMirror ghi đè làm mất ảnh
    await connection.execute(
      `INSERT INTO wish_images (student_id, kind, image_url, public_id, position)
       SELECT id, ?, ${urlColumn}, ${publicIdColumn}, 0 FROM students
       WHERE id = ? AND ${urlColumn} IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM wish_images WHERE student_id = ? AND kind = ?)`,
      [kind, studentId, studentId, kind],
    );
    const [[{ total, last }]] = await connection.execute(
      'SELECT COUNT(*) AS total, MAX(position) AS last FROM wish_images WHERE student_id = ? AND kind = ?',
      [studentId, kind],
    );
    const count = Number(total);
    if (count + images.length > LETTER_MAX_IMAGES) {
      const left = LETTER_MAX_IMAGES - count;
      throw httpError(left > 0
        ? `Mỗi lời chúc kèm tối đa ${LETTER_MAX_IMAGES} ảnh — chỉ thêm được ${left} ảnh nữa`
        : `Lời chúc này đã đủ ${LETTER_MAX_IMAGES} ảnh`, 400);
    }
    const start = last === null || last === undefined ? 0 : Number(last) + 1;
    await connection.execute(
      `INSERT INTO wish_images (student_id, kind, image_url, public_id, position)
       VALUES ${images.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
      images.flatMap((image, index) => [studentId, kind, image.url, image.publicId || null, start + index]),
    );
    await syncMirror(connection, studentId, kind);
  });
}

// imageId: bỏ một ảnh; null: bỏ hết ảnh của loại đó. Xoá DB trước, rồi mới
// dọn Cloudinary những ảnh không còn chỗ nào dùng
async function removeWishImages(studentId, kind, imageId = null) {
  const [, publicIdColumn] = wishImageColumns(kind);
  const publicIds = await inTransaction(async (connection) => {
    await lockStudent(connection, studentId);
    const [rows] = imageId === null
      ? await connection.execute(
        'SELECT id, public_id FROM wish_images WHERE student_id = ? AND kind = ?',
        [studentId, kind],
      )
      : await connection.execute(
        'SELECT id, public_id FROM wish_images WHERE id = ? AND student_id = ? AND kind = ?',
        [imageId, studentId, kind],
      );
    if (imageId !== null && !rows.length) throw httpError('Không tìm thấy ảnh', 404);
    // Bỏ hết: cả ảnh ở cột cũ (phòng khi cột cũ lệch với bảng mới)
    const [[mirror]] = await connection.execute(
      `SELECT ${publicIdColumn} AS public_id FROM students WHERE id = ?`,
      [studentId],
    );
    if (rows.length) {
      await connection.execute(
        `DELETE FROM wish_images WHERE id IN (${rows.map(() => '?').join(',')})`,
        rows.map((row) => row.id),
      );
    }
    await syncMirror(connection, studentId, kind);
    return [...rows.map((row) => row.public_id), ...(imageId === null ? [mirror?.public_id] : [])];
  });
  await letterImageService.destroyUnreferenced(publicIds);
}

module.exports = {
  WISH_IMAGE_COLUMNS,
  WISH_KINDS,
  wishImageColumns,
  imagesForStudents,
  withWishImages,
  addWishImages,
  removeWishImages,
};
