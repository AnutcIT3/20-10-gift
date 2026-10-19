const crypto = require('crypto');
const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');
const { accentKey, sameName } = require('../utils/nameKey');
const letterImageService = require('./letterImageService');
const wishCountService = require('./wishCountService');
const { sanitizeLetterPayload } = require('./letterService');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function generateAccessCode() {
  return crypto.randomBytes(9).toString('base64url');
}

/**
 * Gửi lời chúc cho một người NGOÀI lớp: tự tạo (hoặc dùng lại) hồ sơ
 * member_type='friend' theo tên đã chuẩn hóa, rồi lưu lời chúc ở trạng thái
 * pending như mọi lời chúc khác. Khi người đó tìm tên theo luồng "khách",
 * họ sẽ thấy trang cá nhân với những lời chúc đã được duyệt.
 */
async function createFriendLetter(data, images = []) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }
  const receiverName = typeof data.receiver_name === 'string' ? data.receiver_name.trim() : '';
  if (receiverName.length < 2) throw httpError('Tên người nhận phải có ít nhất 2 ký tự', 400);
  if (receiverName.length > 100) throw httpError('Tên người nhận quá dài (tối đa 100 ký tự)', 400);
  const normalized = normalizeName(receiverName);
  if (normalized.length < 2) throw httpError('Tên người nhận phải có ít nhất 2 ký tự', 400);

  const clean = sanitizeLetterPayload(
    { ...data, status: undefined, student_id: undefined, student_ids: undefined },
    { defaultStatus: 'pending' },
  );

  let studentId;
  let friendCreated = false;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Cùng tên → gộp về một hồ sơ bạn bè. SQL lọc thô theo tên bỏ dấu, rồi
    // giữ dấu khi chọn: thư gửi "Phượng" không được gộp vào hồ sơ "Phương".
    // KHÔNG dùng FOR UPDATE: tên chưa tồn tại thì FOR UPDATE tạo gap lock,
    // hai request song song sẽ deadlock. Race hiếm hoi chỉ tạo ra hai hồ sơ
    // trùng tên (vô hại, admin xóa được) — đánh đổi hợp lý hơn 500.
    const [rows] = await connection.execute(
      "SELECT id, full_name FROM students WHERE member_type = 'friend' AND normalized_name = ? ORDER BY id ASC",
      [normalized],
    );
    const key = accentKey(receiverName);
    const existing = rows.find((row) => accentKey(row.full_name) === key)
      || rows.find((row) => sameName(row.full_name, receiverName));
    studentId = existing?.id;

    if (!studentId) {
      for (let attempt = 0; attempt < 3 && !studentId; attempt += 1) {
        try {
          const [result] = await connection.execute(
            `INSERT INTO students (full_name, normalized_name, class_name, access_code, member_type)
             VALUES (?, ?, 'Bạn bè', ?, 'friend')`,
            [receiverName, normalized, generateAccessCode()],
          );
          studentId = result.insertId;
          friendCreated = true;
        } catch (error) {
          // Đụng access_code trùng (cực hiếm) thì thử mã khác
          if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
        }
      }
    }

    // Cột ảnh cũ = ảnh đầu; đủ ảnh (tối đa 4) ở letter_images
    const [first] = images;
    const [letterResult] = await connection.execute(
      `INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status, reveal_at, image_url, image_public_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, clean.senderName, clean.title, clean.content, clean.isAnonymous, clean.status, clean.revealAt,
        first?.url || null, first?.publicId || null],
    );
    await letterImageService.saveLetterImages(connection, letterResult.insertId, images);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return { status: 'pending', friend_created: friendCreated, wish_number: await wishCountService.numberAfterSend() };
}

module.exports = { createFriendLetter };
