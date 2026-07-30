const pool = require('../config/db');

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
  const [rows] = await pool.execute(
    'SELECT id, sender_name, title, content, created_at FROM letters WHERE student_id = ? AND status = ? ORDER BY created_at DESC',
    [studentId, 'approved'],
  );
  return rows.map((r) => ({
    ...r,
    sender_name: r.sender_name || null,
  }));
}

async function createLetter(studentId, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw Object.assign(new Error('Dữ liệu không hợp lệ'), { statusCode: 400 });
  }
  if (typeof data.content !== 'string') {
    throw Object.assign(new Error('Nội dung là bắt buộc'), { statusCode: 400 });
  }

  const content = data.content.trim();
  if (!content) throw Object.assign(new Error('Nội dung không được để trống'), { statusCode: 400 });
  if (content.length > 5000) throw Object.assign(new Error('Nội dung quá dài (tối đa 5000 ký tự)'), { statusCode: 400 });
  if (data.title !== undefined && data.title !== null && typeof data.title !== 'string') {
    throw Object.assign(new Error('Tiêu đề không hợp lệ'), { statusCode: 400 });
  }
  if (data.sender_name !== undefined && data.sender_name !== null && typeof data.sender_name !== 'string') {
    throw Object.assign(new Error('Tên người gửi không hợp lệ'), { statusCode: 400 });
  }
  if (data.is_anonymous !== undefined && typeof data.is_anonymous !== 'boolean') {
    throw Object.assign(new Error('is_anonymous phải là boolean'), { statusCode: 400 });
  }

  const title = data.title ? data.title.trim() : null;
  const submittedSenderName = data.sender_name ? data.sender_name.trim() : null;
  if (title && title.length > 200) {
    throw Object.assign(new Error('Tiêu đề quá dài (tối đa 200 ký tự)'), { statusCode: 400 });
  }
  if (submittedSenderName && submittedSenderName.length > 100) {
    throw Object.assign(new Error('Tên người gửi quá dài (tối đa 100 ký tự)'), { statusCode: 400 });
  }

  const senderName = data.is_anonymous ? null : submittedSenderName;
  if (data.is_anonymous !== true && !senderName) {
    throw Object.assign(new Error('Tên người gửi là bắt buộc khi không ẩn danh'), { statusCode: 400 });
  }

  await pool.execute(
    'INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status) VALUES (?, ?, ?, ?, ?, ?)',
    [studentId, senderName, title, content, data.is_anonymous === true, 'pending'],
  );

  return { status: 'pending' };
}

module.exports = { getStudentByCode, getGallery, getApprovedLetters, createLetter };
