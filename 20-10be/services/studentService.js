const crypto = require('crypto');
const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');
const normalizeName = require('../utils/normalizeName');
const { accentKey } = require('../utils/nameKey');
const letterService = require('./letterService');

const EDITABLE_FIELDS = ['nickname', 'avatar_url', 'intro_message', 'admin_wish', 'greeting_custom', 'class_name', 'member_type'];
// Admin chỉ đổi qua lại giữa thành viên lớp và tài khoản thử; hồ sơ bạn ngoài
// lớp nằm ở không gian tên riêng
const ADMIN_MEMBER_TYPES = ['class', 'test'];
// Lúc TẠO thì admin được thêm cả khách ngoài lớp (để đăng ký Face ID cho họ
// trước khi ai gửi lời chúc); đã tạo rồi thì không đổi qua lại với lớp
const CREATE_MEMBER_TYPES = [...ADMIN_MEMBER_TYPES, 'friend'];
const SPECIAL_SEAT = { row: 0, column: 9 };

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function validateText(value, field, max, required = false) {
  if (value === undefined) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string') throw httpError(`${field} không hợp lệ`, 400);
  const trimmed = value.trim();
  if (required && !trimmed) throw httpError(`${field} là bắt buộc`, 400);
  if (trimmed.length > max) throw httpError(`${field} tối đa ${max} ký tự`, 400);
  return trimmed || null;
}

// Ảnh đại diện phải là ảnh đã tải lên Cloudinary (hoặc đường dẫn nội bộ):
// CSP của trang quà chỉ cho phép img-src res.cloudinary.com, nên link dán từ
// Facebook/Drive hiện được ở máy dev rồi bị trình duyệt chặn im lặng lúc
// chạy thật. Chặn ngay lúc lưu để admin biết liền thay vì phát hiện hôm 20/10.
function validateAvatarUrl(value) {
  if (value === undefined || value === null) return value;
  // "/logo.jpg" là đường dẫn nội bộ; "//host/…" thì trình duyệt hiểu là link
  // ngoài (tự thêm https:) nên phải đi qua bước kiểm tra host bên dưới
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError('Ảnh đại diện phải là link ảnh đã tải lên thư viện (https://res.cloudinary.com/…)', 400);
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
    throw httpError('Ảnh đại diện phải là ảnh trong thư viện của lớp (res.cloudinary.com), link ngoài sẽ bị trang quà chặn', 400);
  }
  return canonicalCloudinaryUrl(parsed) || value;
}

// Link copy từ trang quà mang theo đoạn biến đổi (f_auto,…,w_600/). Bỏ đoạn
// đó để avatar trùng khít image_url gốc trong thư viện: nhờ vậy chặn xóa ảnh
// đang làm avatar và huy hiệu "Ảnh đại diện" ở trang admin vẫn nhận ra nó.
function canonicalCloudinaryUrl(parsed) {
  const marker = '/image/upload/';
  const at = parsed.pathname.indexOf(marker);
  if (at === -1) return null;
  const segments = parsed.pathname.slice(at + marker.length).split('/');
  const keepFrom = segments.findIndex((segment) => /^v\d+$/.test(segment) || segment === 'gift_20_10');
  if (keepFrom <= 0) return null;
  return `${parsed.origin}${parsed.pathname.slice(0, at + marker.length)}${segments.slice(keepFrom).join('/')}`;
}

function sanitizeInput(data, requireName = false, memberTypes = ADMIN_MEMBER_TYPES) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }
  const clean = {};
  if (requireName || data.full_name !== undefined) {
    clean.full_name = validateText(data.full_name, 'full_name', 100, true);
    clean.normalized_name = normalizeName(clean.full_name);
  }
  clean.nickname = validateText(data.nickname, 'nickname', 50);
  clean.avatar_url = validateAvatarUrl(validateText(data.avatar_url, 'avatar_url', 500));
  clean.intro_message = validateText(data.intro_message, 'intro_message', 65535);
  clean.admin_wish = validateText(data.admin_wish, 'admin_wish', 65535);
  // Lời chúc ✨ admin tự viết; để trống (null) thì máy viết như cũ
  clean.greeting_custom = validateText(data.greeting_custom, 'greeting_custom', 2000);
  clean.class_name = validateText(data.class_name, 'class_name', 20);
  if (data.member_type !== undefined) {
    if (!memberTypes.includes(data.member_type)) throw httpError('Loại thành viên không hợp lệ', 400);
    clean.member_type = data.member_type;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'seat_row')
    || Object.prototype.hasOwnProperty.call(data, 'seat_col')) {
    Object.assign(clean, parseSeatPosition(data));
  }
  return Object.fromEntries(Object.entries(clean).filter(([, value]) => value !== undefined));
}

// Các cột đếm từ subquery về dạng chuỗi/BigInt tùy driver — ép về number,
// và chỉ khi có mặt (getStudent không kèm đếm thì không bịa ra số 0)
const COUNT_FIELDS = ['view_count', 'gallery_count', 'letter_count', 'pending_letter_count', 'face_profile_count'];

function presentStudent(row) {
  const { access_code: accessCode, normalized_name: _normalizedName, ...student } = row;
  for (const field of COUNT_FIELDS) {
    if (student[field] !== undefined && student[field] !== null) student[field] = Number(student[field]);
  }
  return { ...student, giftPath: `/gift/${accessCode}` };
}

function generateAccessCode() {
  return crypto.randomBytes(9).toString('base64url');
}

function parseSeatPosition(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu vị trí không hợp lệ', 400);
  }

  const rowIsEmpty = data.seat_row == null || data.seat_row === '';
  const columnIsEmpty = data.seat_col == null || data.seat_col === '';
  if (rowIsEmpty && columnIsEmpty) return { seat_row: null, seat_col: null };
  if (rowIsEmpty || columnIsEmpty) {
    throw httpError('Hàng và cột phải được cập nhật cùng nhau', 400);
  }

  const seatRow = Number(data.seat_row);
  const seatColumn = Number(data.seat_col);
  if (seatRow === SPECIAL_SEAT.row && seatColumn === SPECIAL_SEAT.column) {
    return { seat_row: seatRow, seat_col: seatColumn };
  }
  if (!Number.isInteger(seatRow) || seatRow < 1 || seatRow > 6) {
    throw httpError('Vị trí hàng ghế không hợp lệ', 400);
  }
  if (!Number.isInteger(seatColumn) || seatColumn < 1 || seatColumn > 8) {
    throw httpError('Vị trí cột ghế không hợp lệ', 400);
  }
  return { seat_row: seatRow, seat_col: seatColumn };
}

function normalizeAccessCode(value) {
  if (typeof value !== 'string') throw httpError('Mã link là bắt buộc', 400);
  const accessCode = value.trim().toLowerCase();
  if (accessCode.length < 3 || accessCode.length > 20) {
    throw httpError('Mã link phải có từ 3 đến 20 ký tự', 400);
  }
  if (!/^[a-z0-9_-]+$/.test(accessCode)) {
    throw httpError('Mã link chỉ được gồm chữ không dấu, số, dấu gạch ngang hoặc gạch dưới', 400);
  }
  return accessCode;
}

// Giữ dấu (Thúy ≠ Thủy) nhưng "Thủy" và "Thuỷ" là một tên
const canonicalVisibleName = accentKey;

async function assertNoDuplicateVisibleName(fullName, excludeId = null) {
  const normalized = normalizeName(fullName);
  const params = [normalized];
  // Chỉ so với thành viên LỚP: hồ sơ "bạn bè" (do người ngoài tạo khi gửi lời
  // chúc) không được phép chặn admin thêm/kích hoạt học sinh trùng tên. Tài
  // khoản thử thì có: gõ tên tìm cả hai loại, trùng tên là mở nhầm trang
  let sql = "SELECT id, full_name FROM students WHERE normalized_name = ? AND is_active = TRUE AND member_type IN ('class', 'test')";
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  const canonical = canonicalVisibleName(fullName);
  const duplicate = rows.find((row) => canonicalVisibleName(row.full_name) === canonical);
  if (duplicate) {
    throw httpError(`Đã tồn tại học sinh tên ${fullName}`, 409);
  }
}

// Bảng admin cần số ảnh, số lời chúc (đã duyệt / chờ duyệt) và lượt xem của
// từng người; subquery tương quan là đủ cho quy mô một lớp (vài chục dòng)
// face_profile_count: khách ngoài lớp có Face ID là bạn thân (lời chúc thân
// mật) — admin cần thấy ai đã đăng ký. Máy chưa có bảng face_profiles thì bỏ cột.
const FACE_COUNT_SQL = ',\n      (SELECT COUNT(*) FROM face_profiles fp WHERE fp.student_id = s.id) AS face_profile_count';

function listStudentsSql(withFaces) {
  return `SELECT s.id, s.full_name, s.nickname, s.avatar_url, s.intro_message, s.admin_wish, s.class_name,
      s.intro_image_url, s.admin_wish_image_url, s.greeting_image_url, s.greeting_custom,
      s.seat_row, s.seat_col, s.is_active, s.access_code, s.member_type, s.view_count,
      s.created_at, s.updated_at,
      (SELECT COUNT(*) FROM gallery g WHERE g.student_id = s.id) AS gallery_count,
      (SELECT COUNT(*) FROM letters l WHERE l.student_id = s.id AND l.status = 'approved') AS letter_count,
      (SELECT COUNT(*) FROM letters l WHERE l.student_id = s.id AND l.status = 'pending') AS pending_letter_count${withFaces ? FACE_COUNT_SQL : ''}
     FROM students s ORDER BY s.full_name ASC`;
}

async function listStudents() {
  let rows;
  try {
    [rows] = await pool.execute(listStudentsSql(true));
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
    [rows] = await pool.execute(listStudentsSql(false));
  }
  return rows.map(presentStudent);
}

async function getStudent(id) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, nickname, avatar_url, intro_message, admin_wish, class_name,
      intro_image_url, admin_wish_image_url, greeting_image_url, greeting_custom,
      seat_row, seat_col, is_active, access_code, member_type, view_count, created_at, updated_at
     FROM students WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? presentStudent(rows[0]) : null;
}

// Khách trùng tên với một khách đã có là mở nhầm trang của nhau (lời chúc gửi
// tới tên đó cũng gộp về một hồ sơ) — chặn; trùng tên với bạn trong lớp thì
// được, vì hai nhóm tra tên và Face ID riêng
async function assertNoDuplicateFriendName(fullName) {
  const [rows] = await pool.execute(
    "SELECT id, full_name FROM students WHERE member_type = 'friend' AND normalized_name = ?",
    [normalizeName(fullName)],
  );
  if (rows.some((row) => canonicalVisibleName(row.full_name) === canonicalVisibleName(fullName))) {
    throw httpError(`Đã có khách tên ${fullName}`, 409);
  }
}

async function createStudent(data) {
  const clean = sanitizeInput(data, true, CREATE_MEMBER_TYPES);
  const isFriend = clean.member_type === 'friend';
  if (isFriend) {
    await assertNoDuplicateFriendName(clean.full_name);
    // Khách không có chỗ trong sơ đồ lớp
    clean.seat_row = null;
    clean.seat_col = null;
    clean.class_name = clean.class_name || 'Bạn bè';
  } else {
    await assertNoDuplicateVisibleName(clean.full_name);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accessCode = generateAccessCode();
    try {
      const [result] = await pool.execute(
        `INSERT INTO students
          (full_name, normalized_name, nickname, avatar_url, intro_message, admin_wish, class_name, access_code, seat_row, seat_col, member_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clean.full_name, clean.normalized_name, clean.nickname || null,
          clean.avatar_url || null, clean.intro_message || null, clean.admin_wish || null, clean.class_name || 'A1', accessCode,
          clean.seat_row ?? null, clean.seat_col ?? null, clean.member_type || 'class'],
      );
      return getStudent(result.insertId);
    } catch (error) {
      // ER_DUP_ENTRY có thể do trùng access_code (retry được) hoặc trùng ghế
      // (uq_students_seat — retry vô ích, phải báo 409 đúng nguyên nhân)
      if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uq_students_seat')) {
        throw httpError('Vị trí ghế đã có học sinh khác', 409);
      }
      if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
    }
  }
  throw httpError('Không thể tạo access code', 500);
}

async function updateStudent(id, data) {
  const clean = sanitizeInput(data);
  if (clean.full_name) await assertNoDuplicateVisibleName(clean.full_name, id);
  const allowed = ['full_name', 'normalized_name', ...EDITABLE_FIELDS, 'seat_row', 'seat_col'];
  const entries = Object.entries(clean).filter(([key]) => allowed.includes(key));
  if (!entries.length) throw httpError('Không có dữ liệu để cập nhật', 400);

  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  // Đổi loại chỉ áp cho thành viên lớp / tài khoản thử, không bao giờ biến hồ
  // sơ bạn ngoài lớp thành người trong lớp
  const guard = clean.member_type ? " AND member_type <> 'friend'" : '';
  let result;
  try {
    [result] = await pool.execute(
      `UPDATE students SET ${assignments} WHERE id = ?${guard}`,
      [...entries.map(([, value]) => value), id],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uq_students_seat')) {
      throw httpError('Vị trí ghế đã có học sinh khác', 409);
    }
    throw error;
  }
  if (!result.affectedRows) {
    if (guard && await getStudent(id)) throw httpError('Hồ sơ bạn ngoài lớp không đổi loại được', 400);
    throw httpError('Không tìm thấy học sinh', 404);
  }
  return getStudent(id);
}

async function deactivateStudent(id) {
  const [result] = await pool.execute('UPDATE students SET is_active = FALSE WHERE id = ?', [id]);
  if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
  return { is_active: false };
}

async function activateStudent(id) {
  const [rows] = await pool.execute(
    'SELECT id, full_name FROM students WHERE id = ? LIMIT 1',
    [id],
  );
  const student = rows[0];
  if (!student) throw httpError('Không tìm thấy học sinh', 404);

  await assertNoDuplicateVisibleName(student.full_name, id);
  await pool.execute('UPDATE students SET is_active = TRUE WHERE id = ?', [id]);
  return { is_active: true };
}

async function deleteStudent(id) {
  const connection = await pool.getConnection();
  let assets = [];
  try {
    await connection.beginTransaction();
    const [assetRows] = await connection.execute(
      `SELECT public_id, resource_type, 0 AS from_letter FROM gallery WHERE student_id = ? AND public_id IS NOT NULL
       UNION ALL
       SELECT public_id, resource_type, 0 AS from_letter FROM music WHERE student_id = ? AND public_id IS NOT NULL
       UNION ALL
       SELECT public_id, resource_type, 0 AS from_letter FROM videos WHERE student_id = ? AND public_id IS NOT NULL
       UNION ALL
       SELECT image_public_id AS public_id, 'image' AS resource_type, 1 AS from_letter FROM letters WHERE student_id = ? AND image_public_id IS NOT NULL
       UNION ALL
       SELECT intro_image_public_id, 'image', 0 FROM students WHERE id = ? AND intro_image_public_id IS NOT NULL
       UNION ALL
       SELECT admin_wish_image_public_id, 'image', 0 FROM students WHERE id = ? AND admin_wish_image_public_id IS NOT NULL
       UNION ALL
       SELECT greeting_image_public_id, 'image', 0 FROM students WHERE id = ? AND greeting_image_public_id IS NOT NULL`,
      [id, id, id, id, id, id, id],
    );
    assets = assetRows;

    const [result] = await connection.execute('DELETE FROM students WHERE id = ?', [id]);
    if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  // Ảnh trong lời chúc admin gửi nhiều người dùng chung: thư của bạn khác
  // còn trỏ tới thì giữ ảnh lại. Không kiểm tra được thì cũng giữ lại.
  const letterImages = assets.filter((asset) => Number(asset.from_letter) === 1).map((asset) => asset.public_id);
  if (letterImages.length) {
    let orphans = [];
    try {
      orphans = await letterService.unreferencedLetterImages(letterImages);
    } catch (error) {
      console.error('Letter image reference check failed:', error.message);
    }
    assets = assets.filter((asset) => Number(asset.from_letter) !== 1 || orphans.includes(asset.public_id));
  }

  const cleanupResults = await Promise.allSettled(assets.map((asset) => (
    cloudinary.uploader.destroy(asset.public_id, {
      resource_type: asset.resource_type || 'image',
    })
  )));
  const cleanupFailed = cleanupResults.filter((result) => result.status === 'rejected').length;
  if (cleanupFailed) {
    console.error(`Cloudinary cleanup failed for ${cleanupFailed} asset(s) of student ${id}`);
  }

  return {
    deleted: true,
    assetsDeleted: assets.length - cleanupFailed,
    assetCleanupFailed: cleanupFailed,
  };
}

async function updateAccessCode(id, value) {
  const accessCode = normalizeAccessCode(value);
  try {
    const [result] = await pool.execute(
      'UPDATE students SET access_code = ? WHERE id = ?',
      [accessCode, id],
    );
    if (!result.affectedRows) throw httpError('Không tìm thấy học sinh', 404);
    return { giftPath: `/gift/${accessCode}` };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError('Mã link này đã được sử dụng', 409);
    }
    throw error;
  }
}

async function updateSeat(id, data) {
  const target = parseSeatPosition(data);
  const connection = await pool.getConnection();
  let affectedStudentId = null;
  let action = target.seat_row === null ? 'cleared' : 'moved';

  try {
    await connection.beginTransaction();
    const params = [id];
    let lockSql = `SELECT id, seat_row, seat_col FROM students WHERE id = ?`;
    if (target.seat_row !== null) {
      lockSql += ' OR (seat_row = ? AND seat_col = ?)';
      params.push(target.seat_row, target.seat_col);
    }
    lockSql += ' ORDER BY id FOR UPDATE';

    const [lockedStudents] = await connection.execute(lockSql, params);
    const student = lockedStudents.find((row) => Number(row.id) === Number(id));
    if (!student) throw httpError('Không tìm thấy học sinh', 404);

    const targetStudent = target.seat_row === null
      ? null
      : lockedStudents.find((row) => Number(row.id) !== Number(id));

    if (targetStudent) {
      await connection.execute(
        'UPDATE students SET seat_row = NULL, seat_col = NULL WHERE id = ?',
        [student.id],
      );
      await connection.execute(
        'UPDATE students SET seat_row = ?, seat_col = ? WHERE id = ?',
        [student.seat_row, student.seat_col, targetStudent.id],
      );
      affectedStudentId = targetStudent.id;
      action = student.seat_row === null || student.seat_col === null ? 'replaced' : 'swapped';
    }

    await connection.execute(
      'UPDATE students SET seat_row = ?, seat_col = ? WHERE id = ?',
      [target.seat_row, target.seat_col, student.id],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError('Vị trí vừa được thay đổi bởi một thao tác khác', 409);
    }
    throw error;
  } finally {
    connection.release();
  }

  const [student, affectedStudent] = await Promise.all([
    getStudent(id),
    affectedStudentId ? getStudent(affectedStudentId) : Promise.resolve(null),
  ]);
  return { action, student, affectedStudent };
}

// Ảnh kèm ba lời chúc riêng của một bạn (migration 023). Tên cột cố định theo
// loại, không bao giờ lấy từ dữ liệu người gửi
const WISH_IMAGE_COLUMNS = Object.freeze({
  intro: ['intro_image_url', 'intro_image_public_id'],
  admin_wish: ['admin_wish_image_url', 'admin_wish_image_public_id'],
  greeting: ['greeting_image_url', 'greeting_image_public_id'],
});

function wishImageColumns(kind) {
  const columns = WISH_IMAGE_COLUMNS[kind];
  if (!columns) throw httpError('Loại lời chúc không hợp lệ (intro, admin_wish hoặc greeting)', 400);
  return columns;
}

// Ghi DB trước, dọn ảnh cũ trên Cloudinary sau (best-effort): lỗi dọn chỉ để
// lại file mồ côi vô hại
async function destroyQuietly(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error(`Cloudinary cleanup failed for ${publicId}:`, error.message);
  }
}

// image: { url, publicId } vừa upload; null = bỏ ảnh. Ảnh cũ (nếu có) bị dọn.
async function setWishImage(id, kind, image) {
  const [urlColumn, publicIdColumn] = wishImageColumns(kind);
  const [rows] = await pool.execute(`SELECT ${publicIdColumn} AS public_id FROM students WHERE id = ? LIMIT 1`, [id]);
  if (!rows.length) throw httpError('Không tìm thấy học sinh', 404);
  await pool.execute(
    `UPDATE students SET ${urlColumn} = ?, ${publicIdColumn} = ? WHERE id = ?`,
    [image?.url || null, image?.publicId || null, id],
  );
  if (rows[0].public_id && rows[0].public_id !== image?.publicId) await destroyQuietly(rows[0].public_id);
  return getStudent(id);
}

module.exports = {
  listStudents, getStudent, createStudent, updateStudent, deactivateStudent, activateStudent,
  deleteStudent, updateAccessCode, updateSeat, validateAvatarUrl, setWishImage, WISH_IMAGE_COLUMNS,
};
