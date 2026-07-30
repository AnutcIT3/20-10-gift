const pool = require('../config/db');

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
  // Chỉ trả letter đã approved VÀ (reveal_at IS NULL hoặc reveal_at <= NOW())
  const [rows] = await pool.execute(
    `SELECT id, sender_name, is_anonymous, title, content, reveal_at, created_at
     FROM letters
     WHERE student_id = ? AND status = 'approved'
       AND (reveal_at IS NULL OR reveal_at <= NOW())
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
  if (typeof data.content !== 'string') {
    throw httpError('Nội dung là bắt buộc', 400);
  }

  const content = data.content.trim();
  if (!content) throw httpError('Nội dung không được để trống', 400);
  if (content.length > 5000) throw httpError('Nội dung quá dài (tối đa 5000 ký tự)', 400);

  if (data.title !== undefined && data.title !== null && typeof data.title !== 'string') {
    throw httpError('Tiêu đề không hợp lệ', 400);
  }
  if (data.sender_name !== undefined && data.sender_name !== null && typeof data.sender_name !== 'string') {
    throw httpError('Tên người gửi không hợp lệ', 400);
  }
  if (data.is_anonymous !== undefined && typeof data.is_anonymous !== 'boolean') {
    throw httpError('is_anonymous phải là boolean', 400);
  }

  const title = data.title ? data.title.trim() : null;
  const submittedSenderName = data.sender_name ? data.sender_name.trim() : null;
  if (title && title.length > 200) throw httpError('Tiêu đề quá dài (tối đa 200 ký tự)', 400);
  if (submittedSenderName && submittedSenderName.length > 100) {
    throw httpError('Tên người gửi quá dài (tối đa 100 ký tự)', 400);
  }

  const senderName = data.is_anonymous ? null : submittedSenderName;
  if (data.is_anonymous !== true && !senderName) {
    throw httpError('Tên người gửi là bắt buộc khi không ẩn danh', 400);
  }

  // Validate reveal_at — optional, phải là datetime hợp lệ trong tương lai (max 1 năm)
  let revealAt = null;
  if (data.reveal_at) {
    const dt = new Date(data.reveal_at);
    if (Number.isNaN(dt.getTime())) throw httpError('reveal_at không phải ngày hợp lệ', 400);
    const now = new Date();
    if (dt <= now) throw httpError('reveal_at phải là thời điểm trong tương lai', 400);
    const maxDate = new Date(now);
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    if (dt > maxDate) throw httpError('reveal_at không được quá 1 năm từ hiện tại', 400);
    // Format thành MySQL DATETIME
    revealAt = dt.toISOString().slice(0, 19).replace('T', ' ');
  }

  await pool.execute(
    'INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status, reveal_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [studentId, senderName, title, content, data.is_anonymous === true, 'pending', revealAt],
  );

  return { status: 'pending' };
}

module.exports = { getStudentByCode, getGallery, getApprovedLetters, createLetter };
