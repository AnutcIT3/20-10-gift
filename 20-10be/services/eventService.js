const pool = require('../config/db');
const settingsService = require('./settingsService');
const replyService = require('./replyService');

const OPEN_METHODS = new Set(['name', 'face']);
// Cả lớp cùng chờ ở trang chủ, mỗi người hỏi trạng thái 30 giây một lần: đệm
// vài giây để lúc nửa đêm vẫn chỉ vài câu SQL chứ không phải hàng trăm
const COUNTS_TTL_MS = 5000;

let countsCache = null;

function isMissingTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE';
}

async function classTotal() {
  const [[row]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM students WHERE member_type = 'class' AND is_active = TRUE",
  );
  return Number(row?.total || 0);
}

// Lượt mở ĐẦU TIÊN của từng thành viên lớp kể từ mốc đếm, sớm nhất trước —
// thứ tự này chính là "bạn thứ mấy mở quà". Xếp theo id tự tăng (đúng thứ tự
// ghi) chứ không theo opened_at: TIMESTAMP chỉ chính xác tới giây, hai bạn mở
// cùng một giây lúc nửa đêm sẽ cùng được báo "bạn thứ 1"
async function firstOpens(since) {
  const params = [];
  let window = '';
  if (since) {
    window = 'AND o.opened_at >= ?';
    params.push(since);
  }
  const [rows] = await pool.execute(
    `SELECT o.student_id, MIN(o.id) AS first_id
     FROM gift_opens o JOIN students s ON s.id = o.student_id
     WHERE s.member_type = 'class' AND s.is_active = TRUE ${window}
     GROUP BY o.student_id
     ORDER BY first_id ASC`,
    params,
  );
  return rows;
}

// { opened, total, since } cho bông hoa; null khi máy chưa chạy migration 020
async function openSummary() {
  const since = await settingsService.getGiftOpensSince();
  try {
    const [rows, total] = await Promise.all([firstOpens(since), classTotal()]);
    return { opened: rows.length, total, since: since ? since.toISOString() : null };
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function cachedCounts(now) {
  if (countsCache && now.getTime() - countsCache.at < COUNTS_TTL_MS) return countsCache.value;
  const [opens, replies] = await Promise.all([openSummary(), replyService.countApproved()]);
  const value = { opened: opens?.opened ?? 0, total: opens?.total ?? 0, replies };
  countsCache = { at: now.getTime(), value };
  return value;
}

// Trạng thái công khai cho trang chủ: đang khoá thì chỉ có giờ tự mở để đếm
// ngược; đã mở thì kèm bông hoa (bao nhiêu bạn đã mở quà) và số thư hồi âm
async function getStatus(now = new Date()) {
  const lock = await settingsService.getGiftLockState(now);
  const status = {
    locked: lock.locked,
    unlockAt: lock.unlockAt ? lock.unlockAt.toISOString() : null,
    serverNow: now.toISOString(),
  };
  if (lock.locked) return status;
  return { ...status, ...(await cachedCounts(now)) };
}

// Ghi một lượt mở quà từ trang chủ và cho biết bạn ấy là người thứ mấy. Hồ sơ
// bạn ngoài lớp không nằm trong bông hoa của lớp nên không được đếm.
async function recordOpen(student, via) {
  if (student.member_type !== 'class') return { counted: false };
  const method = OPEN_METHODS.has(via) ? via : 'name';
  await pool.execute('INSERT INTO gift_opens (student_id, via) VALUES (?, ?)', [student.id, method]);
  countsCache = null;
  const since = await settingsService.getGiftOpensSince();
  const [rows, total] = await Promise.all([firstOpens(since), classTotal()]);
  const index = rows.findIndex((row) => Number(row.student_id) === Number(student.id));
  return {
    counted: true,
    rank: index >= 0 ? index + 1 : null,
    opened: rows.length,
    total,
  };
}

function clearCache() {
  countsCache = null;
}

module.exports = { getStatus, recordOpen, openSummary, clearCache };
