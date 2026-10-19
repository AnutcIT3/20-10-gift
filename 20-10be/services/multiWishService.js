const pool = require('../config/db');
const { sanitizeLetterPayload } = require('./letterService');
const letterImageService = require('./letterImageService');
const wishCountService = require('./wishCountService');
const { findOrCreateFriend, cleanReceiverName } = require('./friendService');

// Một người gửi một lời chúc cho nhiều bạn cùng lúc (form gửi lời chúc ở trang
// chủ). Mỗi người nhận có một lá thư riêng — như gửi từng lá — nhưng ảnh chỉ
// tải lên một lần và dùng chung (đếm tham chiếu khi xoá đã lo phần dọn ảnh).
// Đủ cho cả lớp (18 bạn + cô) cộng vài bạn ngoài lớp trong một lần gửi
const MAX_RECIPIENTS = 30;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Danh sách để tích chọn trong form gửi lời chúc: các bạn trong lớp và cô
// giáo, kèm biệt danh. Chỉ id nội bộ + tên — KHÔNG có mã mở quà, ảnh hay chỗ
// ngồi (form công khai, xem được cả lúc khoá chờ 20/10). Cô giáo đứng đầu.
async function listRecipients() {
  const [rows] = await pool.execute(
    "SELECT id, full_name, nickname FROM students WHERE member_type = 'class' AND is_active = TRUE",
  );
  const isTeacher = (item) => /^cô(\s|$)/i.test(item.name.trim());
  return rows
    .map((row) => ({ id: row.id, name: row.full_name, nickname: row.nickname && row.nickname !== row.full_name ? row.nickname : '' }))
    .sort((a, b) => Number(isTeacher(b)) - Number(isTeacher(a)) || a.name.localeCompare(b.name, 'vi'));
}

// recipients: [{ id } (từ danh sách) | { code: '<access code>' } | { friend: '<tên người ngoài lớp>' }]
// (multipart thì là chuỗi JSON). Bỏ trùng; sai dạng thì 400.
function parseRecipients(value) {
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      throw httpError('Danh sách người nhận không hợp lệ', 400);
    }
  }
  if (!Array.isArray(list) || !list.length) throw httpError('Chọn ít nhất một người nhận', 400);
  const ids = new Set();
  const codes = new Set();
  const friends = new Map();
  for (const item of list) {
    if (item && Number.isInteger(Number(item.id)) && Number(item.id) > 0 && item.code === undefined && item.friend === undefined) {
      ids.add(Number(item.id));
    } else if (item && typeof item.code === 'string' && item.code.trim()) {
      codes.add(item.code.trim());
    } else if (item && typeof item.friend === 'string') {
      const { receiverName, normalized } = cleanReceiverName(item.friend);
      if (!friends.has(normalized + receiverName.toLowerCase())) friends.set(normalized + receiverName.toLowerCase(), receiverName);
    } else {
      throw httpError('Danh sách người nhận không hợp lệ', 400);
    }
  }
  if (ids.size + codes.size + friends.size > MAX_RECIPIENTS) {
    throw httpError(`Mỗi lần gửi tối đa ${MAX_RECIPIENTS} người nhận`, 400);
  }
  return { ids: [...ids], codes: [...codes], friends: [...friends.values()] };
}

async function createWishes(data, images = []) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }
  const { ids, codes, friends } = parseRecipients(data.recipients);
  // Như form gửi một người: trạng thái luôn chờ duyệt, nhóm người gửi luôn là
  // khách — các trường này không lấy từ người gửi
  const clean = sanitizeLetterPayload(
    {
      ...data, recipients: undefined, status: undefined, student_id: undefined, student_ids: undefined, sender_kind: undefined,
    },
    { defaultStatus: 'pending' },
  );

  const [first] = images;
  let created = 0;
  let friendsCreated = 0;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const studentIds = new Set();
    // Chọn từ danh sách: chỉ các bạn trong lớp (và tài khoản thử), đang hoạt động
    if (ids.length) {
      const [rows] = await connection.execute(
        `SELECT id FROM students WHERE is_active = TRUE AND member_type IN ('class', 'test')
         AND id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      if (rows.length !== ids.length) throw httpError('Không tìm thấy một số người nhận — tải lại trang rồi chọn lại nhé', 404);
      rows.forEach((row) => studentIds.add(row.id));
    }
    if (codes.length) {
      const [rows] = await connection.execute(
        `SELECT id, access_code FROM students WHERE is_active = TRUE AND access_code IN (${codes.map(() => '?').join(',')})`,
        codes,
      );
      if (rows.length !== codes.length) throw httpError('Không tìm thấy một số người nhận — tải lại trang rồi chọn lại nhé', 404);
      rows.forEach((row) => studentIds.add(row.id));
    }
    for (const name of friends) {
      const friend = await findOrCreateFriend(connection, name);
      if (friend.created) friendsCreated += 1;
      studentIds.add(friend.studentId);
    }
    for (const studentId of studentIds) {
      const [result] = await connection.execute(
        `INSERT INTO letters (student_id, sender_name, sender_kind, title, content, is_anonymous, status, reveal_at, image_url, image_public_id)
         VALUES (?, ?, 'guest', ?, ?, ?, ?, ?, ?, ?)`,
        [studentId, clean.senderName, clean.title, clean.content, clean.isAnonymous, clean.status, clean.revealAt,
          first?.url || null, first?.publicId || null],
      );
      await letterImageService.saveLetterImages(connection, result.insertId, images);
      created += 1;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    status: 'pending',
    created,
    friends_created: friendsCreated,
    // "Bạn là người gửi lời chúc thứ N" — cùng số với trang chủ
    wish_number: await wishCountService.numberAfterSend(),
  };
}

module.exports = { createWishes, listRecipients, parseRecipients, MAX_RECIPIENTS };
