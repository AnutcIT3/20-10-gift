const pool = require('../config/db');
const normalizeName = require('../utils/normalizeName');

// 'letter' trả lời người viết một lá thư, 'class' gửi cả lớp, 'admin' gửi
// người làm món quà (người viết lời chúc riêng trên trang). Hồi âm gửi admin là
// thư riêng: chỉ hiện ở trang admin, không bao giờ lên Hộp thư hồi âm công khai.
const TARGETS = ['letter', 'class', 'admin'];
// Điều kiện một hồi âm đã duyệt được lên Hộp thư công khai: không phải thư
// riêng gửi admin, và lá thư được trả lời vẫn còn đó VÀ vẫn đang được duyệt —
// admin gỡ lá thư (từ chối sau khi đã duyệt) thì tên người viết cũng phải rời
// Hộp thư; restore snapshot cũ tắt kiểm tra khoá ngoại nên có thể để lại hồi âm
// trỏ vào thư đã mất
const PUBLIC_REPLY_SQL = `r.status = 'approved' AND s.is_active = TRUE AND r.target <> 'admin'
       AND (r.target <> 'letter' OR (l.id IS NOT NULL AND l.status = 'approved'))`;
const STATUSES = ['pending', 'approved', 'rejected'];
const MAX_REPLY_LENGTH = 2000;
const MAX_BULK_ITEMS = 100;
// Hộp thư hồi âm cả lớp đọc chung: cỡ vài chục bạn × vài dòng, trả một lượt
// (tìm theo tên thì lọc trên toàn bộ trước khi cắt)
const BOARD_LIMIT = 300;
const MAX_NAME_QUERY = 100;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function isMissingTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

function parsePositiveId(value, field = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw httpError(`${field} không hợp lệ`, 400);
  return id;
}

function parseIdList(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw httpError('ids phải là mảng không rỗng', 400);
  if (ids.length > MAX_BULK_ITEMS) {
    throw httpError(`Chỉ được thao tác tối đa ${MAX_BULK_ITEMS} mục mỗi lần`, 400);
  }
  const clean = ids.map((id) => parsePositiveId(id, 'ids'));
  if (new Set(clean).size !== clean.length) throw httpError('ids bị trùng', 400);
  return clean;
}

function validateDecision(status) {
  if (status !== 'approved' && status !== 'rejected') throw httpError('Trạng thái không hợp lệ', 400);
  return status;
}

function sanitizeReply(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Dữ liệu không hợp lệ', 400);
  }
  if (!TARGETS.includes(data.target)) throw httpError('Chưa rõ hồi âm gửi tới ai', 400);
  if (typeof data.content !== 'string') throw httpError('Nội dung là bắt buộc', 400);
  const content = data.content.trim();
  if (!content) throw httpError('Nội dung không được để trống', 400);
  if (content.length > MAX_REPLY_LENGTH) {
    throw httpError(`Hồi âm tối đa ${MAX_REPLY_LENGTH} ký tự`, 400);
  }
  const letterId = data.target === 'letter' ? parsePositiveId(data.letter_id, 'letter_id') : null;
  return { target: data.target, letterId, content };
}

// Chủ trang quà hồi âm. Chỉ trả lời được lá thư đã duyệt, đã tới giờ hiện VÀ
// gửi cho đúng trang này — access code của trang không mở được thư trang khác.
// Luôn chờ duyệt như lời chúc gửi qua form: payload không đặt được trạng thái.
async function createReply(student, data) {
  const clean = sanitizeReply(data);
  if (clean.target === 'letter') {
    const [[letter]] = await pool.execute(
      `SELECT id FROM letters
       WHERE id = ? AND student_id = ? AND status = 'approved'
         AND (reveal_at IS NULL OR reveal_at <= UTC_TIMESTAMP())
       LIMIT 1`,
      [clean.letterId, student.id],
    );
    if (!letter) throw httpError('Không tìm thấy lá thư để hồi âm', 404);
  }
  const [result] = await pool.execute(
    `INSERT INTO letter_replies (student_id, target, letter_id, content, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [student.id, clean.target, clean.letterId, clean.content],
  );
  return {
    id: result.insertId,
    target: clean.target,
    letter_id: clean.letterId,
    content: clean.content,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}

// Hồi âm của chính trang quà (bỏ những cái bị từ chối) để hiện lại "cậu đã
// hồi âm" dưới lá thư. Ai gõ được tên một bạn cũng mở được trang quà của bạn
// ấy, nên thư riêng gửi admin chỉ trả về là "đã gửi", KHÔNG kèm nội dung. Máy
// chưa chạy migration 020 thì coi như chưa có gì — trang quà không được hỏng.
async function listStudentReplies(studentId) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, target, letter_id,
              CASE WHEN target = 'admin' THEN NULL ELSE content END AS content,
              status, created_at
       FROM letter_replies
       WHERE student_id = ? AND status <> 'rejected'
       ORDER BY created_at ASC, id ASC`,
      [studentId],
    );
    return rows;
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

// Người nhận hồi âm như hiện trên Hộp thư: người viết thư có tên, người bạn
// ẩn danh (kèm lúc gửi thư — chỉ chính người đó nhận ra), cả lớp hoặc admin.
// Lá thư gốc không còn (letter_exists rỗng) hay đã bị gỡ thì là 'missing',
// không được đoán thành người ẩn danh.
function recipientOf(row) {
  if (row.target !== 'letter') return { kind: row.target };
  if (!row.letter_exists) return { kind: 'missing' };
  if (row.letter_status && row.letter_status !== 'approved') return { kind: 'missing' };
  if (row.letter_is_anonymous || !row.letter_sender_name) {
    return { kind: 'anonymous', letterSentAt: row.letter_created_at || null };
  }
  return { kind: 'person', name: row.letter_sender_name };
}

// Tách tên thành các chữ: ranh giới là mọi ký tự không phải chữ hay số (dấu
// cách, dấu chấm, emoji…) — "Nam❤️" hay "Hoàng Nam." vẫn có chữ "nam". Mỗi chữ
// giữ hai dạng: nguyên dấu (thường, NFC) và bỏ dấu.
function nameWords(text) {
  return String(text || '')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((raw) => ({ raw, folded: normalizeName(raw) }));
}

// Chữ trong tên người ký (nameWord) có phải chữ người gõ (queryWord) không.
// Giống hệt thì đúng. Người KÝ viết không dấu thì so bỏ dấu: thư ký "Tuan" vẫn
// là của "Tuấn". Còn người GÕ không dấu thì không đoán: "An" là một tên thật,
// báo "có thư gửi cậu" cho An bằng thư gửi "Ân" là báo nhầm người — thà không
// báo (vẫn tìm được ở Hộp thư) còn hơn. Hai bên có dấu mà khác dấu là hai
// người: "Hưng" không phải "Hùng".
function sameWord(nameWord, queryWord) {
  if (nameWord.raw === queryWord.raw) return true;
  return nameWord.raw === nameWord.folded && nameWord.folded === queryWord.folded;
}

// Khớp tên người nhận. Mặc định (ô tìm kiếm, gõ tới đâu lọc tới đó) bỏ dấu và
// khớp từ đầu một chữ: "tuan" khớp "Nguyễn Văn Tuấn", "van tuan" cũng khớp,
// "uan" thì không. exact=true (báo "có thư gửi cậu") phải khớp TRỌN chữ và
// tôn trọng dấu: "An" không được đếm hồi âm gửi "Anh" hay "Ân", "Hưng" không
// đếm "Hùng".
function nameMatches(name, query, exact = false) {
  const words = nameWords(name);
  if (!exact) {
    const folded = ` ${words.map((word) => word.folded).join(' ')}`;
    return folded.includes(` ${query.map((word) => word.folded).join(' ')}`);
  }
  for (let start = 0; start + query.length <= words.length; start += 1) {
    if (query.every((word, offset) => sameWord(words[start + offset], word))) return true;
  }
  return false;
}

function parseNameQuery(value) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string') throw httpError('Tên tìm kiếm không hợp lệ', 400);
  if (value.length > MAX_NAME_QUERY) throw httpError(`Tên tìm kiếm tối đa ${MAX_NAME_QUERY} ký tự`, 400);
  const words = nameWords(value);
  // Một ký tự thì khớp gần như mọi tên: báo lỗi thay vì lặng lẽ bỏ bộ lọc
  if (words.map((word) => word.folded).join(' ').length < 2) {
    throw httpError('Tên tìm kiếm phải có ít nhất 2 ký tự', 400);
  }
  return words;
}

// Hộp thư hồi âm công khai: chỉ hồi âm đã duyệt của thành viên còn hoạt động,
// mới nhất trước. `to` lọc những hồi âm gửi đích danh một người; lọc trên TOÀN
// BỘ hồi âm rồi mới cắt, để hồi âm cũ của một người không bị rơi khỏi kết quả.
async function listBoard({ to, exact = false } = {}) {
  const query = parseNameQuery(to);
  let rows;
  try {
    [rows] = await pool.execute(
      `SELECT r.id, r.target, r.content, r.created_at,
              s.full_name AS from_full_name, s.nickname AS from_nickname, s.member_type AS from_member_type,
              l.id AS letter_exists, l.sender_name AS letter_sender_name, l.is_anonymous AS letter_is_anonymous,
              l.created_at AS letter_created_at
       FROM letter_replies r
       JOIN students s ON s.id = r.student_id
       LEFT JOIN letters l ON l.id = r.letter_id
       WHERE ${PUBLIC_REPLY_SQL}
       ORDER BY r.created_at DESC, r.id DESC`,
    );
  } catch (error) {
    if (isMissingTable(error)) return { items: [], total: 0 };
    throw error;
  }
  const items = rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      created_at: row.created_at,
      from: {
        name: row.from_nickname || row.from_full_name,
        fullName: row.from_full_name,
        friend: row.from_member_type === 'friend',
      },
      to: recipientOf(row),
    }))
    .filter((item) => !query || (item.to.kind === 'person' && nameMatches(item.to.name, query, exact)));
  return { items: items.slice(0, BOARD_LIMIT), total: items.length };
}

async function countApproved() {
  try {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM letter_replies r
       JOIN students s ON s.id = r.student_id
       LEFT JOIN letters l ON l.id = r.letter_id
       WHERE ${PUBLIC_REPLY_SQL}`,
    );
    return Number(row?.total || 0);
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
}

// Bộ đếm cho trang Tổng quan và badge sidebar; null khi chưa có bảng
async function countByStatus() {
  try {
    const [[row]] = await pool.execute(
      `SELECT SUM(status = 'pending') AS pending,
              SUM(status = 'approved') AS approved,
              SUM(status = 'rejected') AS rejected
       FROM letter_replies`,
    );
    return {
      pending: Number(row?.pending || 0),
      approved: Number(row?.approved || 0),
      rejected: Number(row?.rejected || 0),
    };
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

function parseListQuery(query = {}) {
  const status = query.status || 'pending';
  if (!STATUSES.includes(status)) throw httpError('Trạng thái không hợp lệ', 400);
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw httpError('Thông tin phân trang không hợp lệ', 400);
  }
  return { status, page, pageSize };
}

// Danh sách cho admin duyệt, kèm lá thư gốc (trích 280 ký tự) để biết hồi âm
// đang trả lời điều gì
async function listReplies(query) {
  const { status, page, pageSize } = parseListQuery(query);
  const [[countRow]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM letter_replies WHERE status = ?',
    [status],
  );
  const total = Number(countRow?.total || 0);
  const offset = (page - 1) * pageSize;
  // LIMIT/OFFSET nội suy là số nguyên đã kiểm tra ở parseListQuery, không phải input thô
  const [items] = await pool.execute(
    `SELECT r.id, r.student_id, s.full_name AS student_name, s.member_type,
            r.target, r.letter_id, r.content, r.status, r.created_at,
            l.id AS letter_exists, l.status AS letter_status,
            l.sender_name AS letter_sender_name, l.is_anonymous AS letter_is_anonymous,
            l.title AS letter_title, SUBSTRING(l.content, 1, 280) AS letter_excerpt,
            l.created_at AS letter_created_at
     FROM letter_replies r
     JOIN students s ON s.id = r.student_id
     LEFT JOIN letters l ON l.id = r.letter_id
     WHERE r.status = ?
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    [status],
  );
  return {
    items: items.map((item) => ({ ...item, to: recipientOf(item) })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async function updateStatus(id, status) {
  validateDecision(status);
  const [result] = await pool.execute(
    'UPDATE letter_replies SET status = ? WHERE id = ?',
    [status, parsePositiveId(id)],
  );
  if (!result.affectedRows) throw httpError('Không tìm thấy hồi âm', 404);
  return {};
}

async function bulkUpdateStatus(ids, status) {
  const cleanIds = parseIdList(ids);
  validateDecision(status);
  const placeholders = cleanIds.map(() => '?').join(',');
  const [result] = await pool.execute(
    `UPDATE letter_replies SET status = ? WHERE id IN (${placeholders})`,
    [status, ...cleanIds],
  );
  return { updated: result.affectedRows };
}

async function deleteReply(id) {
  const [result] = await pool.execute(
    'DELETE FROM letter_replies WHERE id = ?',
    [parsePositiveId(id)],
  );
  if (!result.affectedRows) throw httpError('Không tìm thấy hồi âm', 404);
  return {};
}

module.exports = {
  MAX_REPLY_LENGTH,
  createReply,
  listStudentReplies,
  listBoard,
  countApproved,
  countByStatus,
  listReplies,
  updateStatus,
  bulkUpdateStatus,
  deleteReply,
  recipientOf,
};
