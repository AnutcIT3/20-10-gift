const pool = require('../config/db');
const { cloudinary } = require('../config/cloudinary');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function listGallery(studentId) {
  const [rows] = await pool.execute(
    `SELECT id, image_url, public_id, resource_type, caption, display_order, created_at
     FROM gallery WHERE student_id = ? ORDER BY display_order ASC, id ASC`,
    [studentId],
  );
  return rows;
}

// Chèn cả lô ảnh trong một transaction: lỗi giữa chừng thì rollback toàn bộ,
// không để lại row trỏ tới ảnh Cloudinary đã bị dọn. Khóa row học sinh để hai
// lượt upload song song không tranh nhau display_order.
async function createImages({ studentId, files, caption }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [students] = await connection.execute(
      'SELECT id FROM students WHERE id = ? LIMIT 1 FOR UPDATE',
      [studentId],
    );
    if (!students.length) throw httpError('Không tìm thấy học sinh', 404);
    const [orderRows] = await connection.execute(
      'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM gallery WHERE student_id = ?',
      [studentId],
    );
    let displayOrder = Number(orderRows[0].next_order);
    const images = [];
    for (const file of files) {
      const [result] = await connection.execute(
        `INSERT INTO gallery (student_id, image_url, public_id, resource_type, caption, display_order)
         VALUES (?, ?, ?, 'image', ?, ?)`,
        [studentId, file.imageUrl, file.publicId, caption || null, displayOrder],
      );
      images.push({ id: result.insertId, image_url: file.imageUrl, public_id: file.publicId });
      displayOrder += 1;
    }
    await connection.commit();
    return images;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function validateReorderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError('items phải là mảng không rỗng', 400);
  }
  const ids = new Set();
  return items.map((item) => {
    const id = Number(item?.id);
    const displayOrder = Number(item?.display_order);
    if (!Number.isInteger(id) || id <= 0
      || !Number.isInteger(displayOrder) || displayOrder < 0) {
      throw httpError('Dữ liệu sắp xếp không hợp lệ', 400);
    }
    if (ids.has(id)) throw httpError('ID gallery bị trùng', 400);
    ids.add(id);
    return { id, display_order: displayOrder };
  });
}

async function reorder(items) {
  const cleanItems = validateReorderItems(items);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = cleanItems.map(() => '?').join(',');
    const [rows] = await connection.execute(
      `SELECT id, student_id FROM gallery WHERE id IN (${placeholders}) FOR UPDATE`,
      cleanItems.map((item) => item.id),
    );
    if (rows.length !== cleanItems.length || new Set(rows.map((row) => row.student_id)).size !== 1) {
      throw httpError('Tất cả ảnh phải tồn tại và thuộc cùng một học sinh', 400);
    }
    for (const item of cleanItems) {
      await connection.execute(
        'UPDATE gallery SET display_order = ? WHERE id = ?',
        [item.display_order, item.id],
      );
    }
    await connection.commit();
    return {};
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteImage(id) {
  const [rows] = await pool.execute(
    'SELECT id, public_id, resource_type, image_url FROM gallery WHERE id = ? LIMIT 1',
    [id],
  );
  const image = rows[0];
  if (!image) throw httpError('Không tìm thấy ảnh', 404);

  // Avatar chỉ là bản sao URL của một ảnh trong thư viện, không có khóa ngoại.
  // Xóa ảnh đó là destroy luôn file trên Cloudinary và avatar gãy im lặng trên
  // trang quà (polaroid rơi về chữ cái đầu, không ai được báo). Chặn lại.
  const [owners] = await pool.execute(
    'SELECT full_name FROM students WHERE avatar_url = ? LIMIT 3',
    [image.image_url],
  );
  if (owners.length) {
    const names = owners.map((row) => row.full_name).join(', ');
    throw httpError(`Ảnh này đang là ảnh đại diện của ${names} — đổi ảnh đại diện trước rồi mới xóa`, 409);
  }

  // Xóa DB trước, Cloudinary sau: nếu Cloudinary lỗi thì chỉ sót file mồ côi
  // vô hại; thứ tự ngược lại để lại row trỏ tới ảnh đã mất (URL 404)
  await pool.execute('DELETE FROM gallery WHERE id = ?', [id]);
  if (image.public_id) {
    try {
      await cloudinary.uploader.destroy(image.public_id, { resource_type: image.resource_type || 'image' });
    } catch (error) {
      console.error(`Cloudinary cleanup failed for ${image.public_id}:`, error.message);
    }
  }
  return {};
}

async function updateCaption(id, caption) {
  const cleanCaption = typeof caption === 'string' ? caption.trim() : '';
  if (cleanCaption.length > 500) throw httpError('Chú thích tối đa 500 ký tự', 400);
  const [result] = await pool.execute(
    'UPDATE gallery SET caption = ? WHERE id = ?',
    [cleanCaption || null, id],
  );
  if (!result.affectedRows) throw httpError('Không tìm thấy ảnh', 404);
  return {};
}

module.exports = { listGallery, createImages, reorder, deleteImage, updateCaption, validateReorderItems };
