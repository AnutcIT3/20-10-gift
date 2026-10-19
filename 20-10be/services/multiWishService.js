const pool = require('../config/db');
const { sanitizeLetterPayload } = require('./letterService');
const letterImageService = require('./letterImageService');
const wishCountService = require('./wishCountService');
const { findFriend, guestNotFound, cleanReceiverName } = require('./friendService');
const resolveService = require('./resolveService');
const normalizeName = require('../utils/normalizeName');
const { accentKey, hasDiacritics } = require('../utils/nameKey');

// Một người gửi một lời chúc cho nhiều bạn cùng lúc (form gửi lời chúc ở trang
// chủ). Mỗi người nhận có một lá thư riêng — như gửi từng lá — nhưng ảnh chỉ
// tải lên một lần và dùng chung (đếm tham chiếu khi xoá đã lo phần dọn ảnh).
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

// Người có CẢ tên (họ tên, biệt danh, tên gọi khác) đúng như chữ đã gõ.
// givenName: gõ phần tên không kèm họ ("Phương Anh" của "Bùi Phương Anh") cũng tính
async function wholeNameRows(typed, memberTypes, { givenName = false } = {}) {
  const [rows] = await pool.execute(
    `SELECT id, full_name, nickname, search_aliases FROM students WHERE is_active = TRUE
     AND member_type IN (${memberTypes.map(() => '?').join(',')})`,
    memberTypes,
  ).catch(async (error) => {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    return pool.execute(
      `SELECT id, full_name, nickname, NULL AS search_aliases FROM students WHERE is_active = TRUE
       AND member_type IN (${memberTypes.map(() => '?').join(',')})`,
      memberTypes,
    );
  });
  const normalized = normalizeName(typed);
  const typedKey = accentKey(typed);
  const typedBare = !hasDiacritics(typed);
  // Phần tên không kèm họ: đúng y dấu, hoặc gõ không dấu mà cùng chữ — "Ánh"
  // không phải phần "Anh" của Hải Anh
  const givenMatches = (name) => {
    const words = name.trim().split(/\s+/);
    return words.slice(1).some((_, index) => {
      const form = words.slice(index + 1).join(' ');
      return accentKey(form) === typedKey || (typedBare && normalizeName(form) === normalized);
    });
  };
  return rows.filter((row) => resolveService.namesOf(row)
    .some((n) => resolveService.isWholeName(n, typed, normalized) || (givenName && givenMatches(n))));
}

// Ô "Ngoài lớp" của form gửi lời chúc: gõ tên một khách đã có trong danh sách
// (admin thêm). Thêm thẳng khi gõ đúng cả tên, phần tên không kèm họ ("Phương
// Anh", "bùi phương anh") hay biệt danh của đúng một khách; chỉ trùng một phần
// ("Phương", "Bùi Phương") thì gợi ý, hỏi "có phải…".
// Gõ tên một bạn TRONG lớp thì nói rõ để chọn ở tab "Trong lớp" — không bao
// giờ đổ nhầm sang một khách trùng một chữ ("Diệu Linh" ↛ khách "Linh").
// { matches: [{ id, name, nickname }], unsure, alsoInClass }
async function findGuests(name) {
  const typed = String(name || '').trim().replace(/\s+/g, ' ');
  const result = await resolveService.resolve(typed, 'friend', { locked: true });
  if (result.error && result.status !== 404) throw httpError(result.error, result.status || 400);
  const [inClass] = await wholeNameRows(typed, ['class']);
  const strong = await wholeNameRows(typed, ['friend'], { givenName: true });

  let rows = [];
  if (!result.error) {
    const paths = result.giftPath ? [result.giftPath] : result.matches.map((match) => match.giftPath);
    const codes = paths.map((giftPath) => giftPath.split('/').pop());
    [rows] = await pool.execute(
      `SELECT id, full_name, nickname, access_code FROM students WHERE member_type = 'friend' AND is_active = TRUE
       AND access_code IN (${codes.map(() => '?').join(',')})`,
      codes,
    );
    rows = codes.map((code) => rows.find((row) => row.access_code === code)).filter(Boolean);
  }
  // Gõ đúng tên bạn trong lớp, không khách nào tên đúng như vậy: chỉ sang tab
  // lớp. Khách có tên CHỨA đủ chữ đó ("Phương Anh" ↔ Bùi Phương Anh) thì vẫn
  // gợi ý kèm lời nhắc; khách chỉ trùng một chữ ("Diệu Linh" ↔ Linh) thì không
  if (inClass && !strong.length) {
    const normalized = normalizeName(typed);
    rows = rows.filter((row) => resolveService.namesOf(row).some((n) => resolveService.startsWord(n, normalized)));
    if (!rows.length) throw httpError(`"${inClass.full_name}" là bạn trong lớp — chọn ở tab "Trong lớp" nhé.`, 404);
  }
  if (!rows.length) throw guestNotFound(typed);
  const present = (row) => ({ id: row.id, name: row.full_name, nickname: row.nickname && row.nickname !== row.full_name ? row.nickname : '' });
  const sure = Boolean(result.giftPath) && strong.length === 1 && strong[0].id === rows[0].id;
  return {
    matches: rows.map(present),
    unsure: !sure,
    // Trong lớp cũng có người tên đúng như vậy (vd. Vân Anh): form nhắc thêm
    ...(inClass ? { alsoInClass: inClass.full_name } : {}),
  };
}

// recipients: [{ id } (danh sách lớp, hay khách đã tra ở ô "Ngoài lớp") | { code: '<access code>' } | { friend: '<tên khách đã có>' }]
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const studentIds = new Set();
    // Chọn từ danh sách lớp hay khách đã tra tên: chỉ người đang hoạt động
    if (ids.length) {
      const [rows] = await connection.execute(
        `SELECT id FROM students WHERE is_active = TRUE AND member_type IN ('class', 'test', 'friend')
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
    // Gửi theo tên: chỉ khách đã có — không tự tạo hồ sơ mới
    for (const name of friends) {
      const friend = await findFriend(connection, name);
      if (!friend) throw guestNotFound(name);
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
    friends_created: 0,
    // "Bạn là người gửi lời chúc thứ N" — cùng số với trang chủ
    wish_number: await wishCountService.numberAfterSend(),
  };
}

module.exports = { createWishes, findGuests, listRecipients, parseRecipients };
