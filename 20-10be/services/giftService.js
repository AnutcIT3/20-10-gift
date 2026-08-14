const pool = require('../config/db');
const { sanitizeLetterPayload } = require('./letterService');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function getStudentByCode(accessCode) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, nickname, avatar_url, intro_message, seat_row, seat_col
     FROM students WHERE access_code = ? AND is_active = TRUE LIMIT 1`,
    [accessCode],
  );
  return rows[0] || null;
}

async function getGallery(studentId) {
  const [rows] = await pool.execute(
    'SELECT id, image_url, caption, display_order FROM gallery WHERE student_id = ? ORDER BY display_order ASC',
    [studentId],
  );
  return rows;
}

async function getApprovedLetters(studentId) {
  // Chỉ trả letter đã approved VÀ đã tới giờ hiện. reveal_at lưu theo UTC nên
  // phải so với UTC_TIMESTAMP(), không dùng NOW() (phụ thuộc múi giờ MySQL)
  const [rows] = await pool.execute(
    `SELECT id, sender_name, is_anonymous, title, content, reveal_at, created_at
     FROM letters
     WHERE student_id = ? AND status = 'approved'
       AND (reveal_at IS NULL OR reveal_at <= UTC_TIMESTAMP())
     ORDER BY created_at DESC`,
    [studentId],
  );
  return rows.map((r) => ({
    ...r,
    sender_name: r.sender_name || null,
    reveal_at: r.reveal_at ? r.reveal_at.toISOString() : null,
  }));
}

async function createLetter(studentId, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }

  // Dùng chung bộ validate với admin (letterService) thay vì bản sao 50 dòng.
  // Các field public không được quyền đặt bị ép bỏ trước khi sanitize:
  // status luôn 'pending', student lấy từ access code chứ không từ payload.
  const clean = sanitizeLetterPayload(
    { ...data, status: undefined, student_id: undefined, student_ids: undefined },
    { defaultStatus: 'pending' },
  );

  await pool.execute(
    'INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status, reveal_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [studentId, clean.senderName, clean.title, clean.content, clean.isAnonymous, clean.status, clean.revealAt],
  );

  return { status: 'pending' };
}

module.exports = { getStudentByCode, getGallery, getApprovedLetters, createLetter };
