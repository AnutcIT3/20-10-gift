const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');
const { accentKey, sameName } = require('../utils/nameKey');
const letterImageService = require('./letterImageService');
const wishCountService = require('./wishCountService');
const { sanitizeLetterPayload } = require('./letterService');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function cleanReceiverName(value) {
  const receiverName = typeof value === 'string' ? value.trim() : '';
  if (receiverName.length < 2) throw httpError('Tên người nhận phải có ít nhất 2 ký tự', 400);
  if (receiverName.length > 100) throw httpError('Tên người nhận quá dài (tối đa 100 ký tự)', 400);
  const normalized = normalizeName(receiverName);
  if (normalized.length < 2) throw httpError('Tên người nhận phải có ít nhất 2 ký tự', 400);
  return { receiverName, normalized };
}

// Khách ngoài lớp chỉ do admin thêm. Gửi lời chúc theo tên thì chỉ TÌM khách
// đã có (trong transaction của người gọi) — không bao giờ tự tạo hồ sơ mới:
// gõ sai một chữ ("phương anh" thay vì "Bùi Phương Anh") từng sinh ra hồ sơ
// lạ không ai mở. Không có thì null. { studentId }
async function findFriend(connection, name) {
  const { receiverName, normalized } = cleanReceiverName(name);
  // SQL lọc thô theo tên bỏ dấu, rồi giữ dấu khi chọn: thư gửi "Phượng" không
  // được gộp vào hồ sơ "Phương"
  const [rows] = await connection.execute(
    "SELECT id, full_name FROM students WHERE member_type = 'friend' AND is_active = TRUE AND normalized_name = ? ORDER BY id ASC",
    [normalized],
  );
  const key = accentKey(receiverName);
  const existing = rows.find((row) => accentKey(row.full_name) === key)
    || rows.find((row) => sameName(row.full_name, receiverName));
  return existing ? { studentId: existing.id } : null;
}

const guestNotFound = (name) => httpError(
  `Không có khách tên "${String(name).trim()}" trong danh sách — kiểm tra lại tên rồi nhập lại nhé.`,
  404,
);

/**
 * Gửi lời chúc cho một người NGOÀI lớp đã có trong danh sách khách (admin
 * thêm), lưu ở trạng thái pending như mọi lời chúc khác. Không có khách tên
 * đó thì 404 — người gửi nhập lại tên.
 */
async function createFriendLetter(data, images = []) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }
  cleanReceiverName(data.receiver_name);

  const clean = sanitizeLetterPayload(
    { ...data, status: undefined, student_id: undefined, student_ids: undefined },
    { defaultStatus: 'pending' },
  );

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const friend = await findFriend(connection, data.receiver_name);
    if (!friend) throw guestNotFound(data.receiver_name);

    // Cột ảnh cũ = ảnh đầu; đủ ảnh (tối đa 4) ở letter_images
    const [first] = images;
    const [letterResult] = await connection.execute(
      `INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status, reveal_at, image_url, image_public_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [friend.studentId, clean.senderName, clean.title, clean.content, clean.isAnonymous, clean.status, clean.revealAt,
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
  return { status: 'pending', friend_created: false, wish_number: await wishCountService.numberAfterSend() };
}

module.exports = { createFriendLetter, findFriend, guestNotFound, cleanReceiverName };
