const pool = require('../config/db');
const { sanitizeLetterPayload } = require('./letterService');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Khách ngoài lớp có Face ID là bạn thân của các bạn nam (admin tự đăng ký
// ảnh cho họ) — trang quà nhận lời chúc thân mật thay vì kiểu "khách ghé thăm",
// dù họ mở bằng Face ID hay gõ tên. Máy chưa có bảng face_profiles thì coi như không.
async function isCloseFriend(studentId) {
  try {
    const [rows] = await pool.execute('SELECT 1 AS found FROM face_profiles WHERE student_id = ? LIMIT 1', [studentId]);
    return rows.length > 0;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return false;
    throw error;
  }
}

const STUDENT_COLUMNS = 'id, full_name, nickname, avatar_url, intro_message, admin_wish, seat_row, seat_col, member_type';
// Ảnh kèm ba lời chúc riêng (migration 023) và lời chúc ✨ admin tự viết
// (migration 024); máy chưa migrate thì đọc như cũ —
// trang quà không được hỏng vì thiếu cột
const WISH_IMAGE_COLUMNS = 'intro_image_url, admin_wish_image_url, greeting_image_url, greeting_custom';

async function findStudentByCode(accessCode, withImages) {
  const columns = withImages ? `${STUDENT_COLUMNS}, ${WISH_IMAGE_COLUMNS}` : STUDENT_COLUMNS;
  return pool.execute(
    `SELECT ${columns}
     FROM students WHERE access_code = ? AND is_active = TRUE LIMIT 1`,
    [accessCode],
  );
}

async function getStudentByCode(accessCode) {
  let rows;
  try {
    [rows] = await findStudentByCode(accessCode, true);
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    [rows] = await findStudentByCode(accessCode, false);
  }
  const student = rows[0] || null;
  if (student?.member_type === 'friend') {
    return { ...student, close_friend: await isCloseFriend(student.id) };
  }
  return student;
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
    `SELECT id, sender_name, sender_kind, is_anonymous, title, content, reveal_at, created_at, image_url
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

async function createLetter(studentId, data, image = null) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }

  // Dùng chung bộ validate với admin (letterService) thay vì bản sao 50 dòng.
  // Các field public không được quyền đặt bị ép bỏ trước khi sanitize:
  // status luôn 'pending', student lấy từ access code chứ không từ payload,
  // sender_kind luôn 'guest' — nhóm "các bạn nam 12A1" chỉ admin nhập được.
  const clean = sanitizeLetterPayload(
    { ...data, status: undefined, student_id: undefined, student_ids: undefined, sender_kind: undefined },
    { defaultStatus: 'pending' },
  );

  await pool.execute(
    `INSERT INTO letters (student_id, sender_name, sender_kind, title, content, is_anonymous, status, reveal_at, image_url, image_public_id)
     VALUES (?, ?, 'guest', ?, ?, ?, ?, ?, ?, ?)`,
    [studentId, clean.senderName, clean.title, clean.content, clean.isAnonymous, clean.status, clean.revealAt,
      image?.url || null, image?.publicId || null],
  );

  return { status: 'pending' };
}

module.exports = { getStudentByCode, getGallery, getApprovedLetters, createLetter };
