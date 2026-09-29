const pool = require('../config/db');
const dataRevisionService = require('./dataRevisionService');

const GIFT_LOCK_KEY = 'gift_pages_locked';
const FACE_ENABLED_KEY = 'face_enabled';
// Giờ trang quà tự mở (ISO UTC); rỗng = không hẹn, admin tự gạt công tắc
const GIFT_UNLOCK_AT_KEY = 'gift_unlock_at';
// Mốc bắt đầu đếm lượt mở quà cho bông hoa 12A1 (ISO UTC); rỗng = đếm hết
const GIFT_OPENS_SINCE_KEY = 'gift_opens_since';
const MAX_SCHEDULE_MS = 366 * 24 * 60 * 60 * 1000;
// Việt Nam không đổi giờ theo mùa: 00:00 ngày 20/10 luôn là 17:00 UTC ngày 19/10
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Chỉ nhận đúng dạng Date.toISOString(): new Date() của V8 dễ dãi tới mức
// chuỗi '1' cũng thành năm 2001 — mà giá trị lạ ở đây nghĩa là quà mở sai giờ
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function parseIso(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readValue(key) {
  const [rows] = await pool.execute(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    [key],
  );
  return rows[0]?.setting_value ?? null;
}

async function readFlag(key) {
  return (await readValue(key)) === '1';
}

async function writeValue(key, value) {
  await pool.execute(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = ?`,
    [key, value, value],
  );
}

async function writeFlag(key, enabled) {
  await writeValue(key, enabled ? '1' : '0');
}

// 00:00 ngày 20/10 (giờ Việt Nam, UTC+7) của năm chứa `date`
function eventDayStart(date) {
  const year = new Date(date.getTime() + VN_OFFSET_MS).getUTCFullYear();
  return new Date(Date.UTC(year, 9, 20) - VN_OFFSET_MS);
}

// Tới giờ hẹn, request đầu tiên sau mốc đó gạt công tắc thay admin. UPDATE có
// điều kiện nên dù cả lớp cùng bấm đúng 00:00 thì cũng chỉ một request thực sự
// lật khoá, rồi dời mốc đếm bông hoa về đúng giờ hẹn: lượt mở thử, lượt tổng
// duyệt trước ngày không bị tính vào hoa. Mốc đã nằm trong ngày 20/10 thì GIỮ:
// admin khoá tạm giữa đêm để sửa một lá thư rồi hẹn mở lại, dời mốc lúc đó là
// xoá sạch những bạn đã mở quà — mà các bạn ấy sẽ không mở lại từ trang chủ.
async function applyScheduledUnlock(unlockAt) {
  const [result] = await pool.execute(
    "UPDATE app_settings SET setting_value = '0' WHERE setting_key = ? AND setting_value = '1'",
    [GIFT_LOCK_KEY],
  );
  if (!result?.affectedRows) return;
  const since = parseIso(await readValue(GIFT_OPENS_SINCE_KEY));
  if (!since || since < eventDayStart(unlockAt)) {
    await writeValue(GIFT_OPENS_SINCE_KEY, unlockAt.toISOString());
  }
  await writeValue(GIFT_UNLOCK_AT_KEY, '');
  // Sidebar admin đang poll data-revision: báo để công tắc tự chuyển sang MỞ
  dataRevisionService.bumpRevision().catch((error) => {
    console.error('[settings.autoUnlock]', error.message);
  });
}

// { locked, unlockAt } — unlockAt chỉ có khi đang khoá và đã hẹn giờ tự mở.
// Không cần tiến trình hẹn giờ nào chạy nền: quá giờ hẹn thì lần đọc kế tiếp
// tự mở, nên máy chủ khởi động lại giữa chừng cũng không lỡ giờ.
async function getGiftLockState(now = new Date()) {
  if (!(await readFlag(GIFT_LOCK_KEY))) return { locked: false, unlockAt: null };
  const unlockAt = parseIso(await readValue(GIFT_UNLOCK_AT_KEY));
  if (!unlockAt || now < unlockAt) return { locked: true, unlockAt };
  await applyScheduledUnlock(unlockAt);
  return { locked: false, unlockAt: null };
}

async function isGiftPagesLocked() {
  return (await getGiftLockState()).locked;
}

async function setGiftPagesLocked(locked) {
  if (typeof locked !== 'boolean') {
    throw httpError('gift_pages_locked phải là boolean', 400);
  }
  const wasLocked = await readFlag(GIFT_LOCK_KEY);
  await writeFlag(GIFT_LOCK_KEY, locked);
  // Đổi trạng thái tay là xoá lịch hẹn cũ: mở tay thì không để đồng hồ treo
  // trên trang chủ cho món quà đã mở; khoá lại (từ trạng thái mở) thì không
  // được thừa hưởng một lịch đã qua — nếu không, lần đọc kế tiếp tự mở lại
  // ngay. Bấm khoá khi vốn đã khoá (thanh bên cũ trên máy khác) thì giữ lịch.
  if (!locked || !wasLocked) await writeValue(GIFT_UNLOCK_AT_KEY, '');
  return { gift_pages_locked: locked };
}

// null/'' huỷ lịch; chuỗi thời điểm thì phải ở tương lai, không quá một năm,
// và chỉ hẹn được lúc trang quà ĐANG KHOÁ — lịch đặt lúc đang mở sẽ nằm ẩn rồi
// bật dậy đúng lúc admin khoá lại (thẻ admin cũ trên máy khác vẫn có thể gửi)
async function setGiftUnlockAt(value, now = new Date()) {
  if (value === null || value === '') {
    await writeValue(GIFT_UNLOCK_AT_KEY, '');
    return { gift_unlock_at: null };
  }
  if (typeof value !== 'string') throw httpError('gift_unlock_at không hợp lệ', 400);
  if (!(await readFlag(GIFT_LOCK_KEY))) {
    throw httpError('Trang quà đang mở — khoá lại trước rồi mới hẹn giờ tự mở', 409);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError('gift_unlock_at không phải thời điểm hợp lệ', 400);
  if (date <= now) throw httpError('Giờ tự mở phải ở tương lai', 400);
  if (date - now > MAX_SCHEDULE_MS) throw httpError('Giờ tự mở không được quá 1 năm', 400);
  const iso = date.toISOString();
  await writeValue(GIFT_UNLOCK_AT_KEY, iso);
  return { gift_unlock_at: iso };
}

async function getGiftOpensSince() {
  return parseIso(await readValue(GIFT_OPENS_SINCE_KEY));
}

// "Đặt lại bông hoa": chỉ dời mốc đếm, không xoá lượt mở nào. Làm tròn xuống
// tới giây vì opened_at chỉ lưu tới giây — lượt mở ngay trong giây đặt lại
// không bị loại oan
async function resetGiftOpens(now = new Date()) {
  const iso = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString();
  await writeValue(GIFT_OPENS_SINCE_KEY, iso);
  return { gift_opens_since: iso };
}

// Công tắc Face ID của admin: tắt là thẻ ✨ biến mất khỏi trang chủ và
// /api/face/match trả 503 ngay, không cần chạm tới face-service
async function isFaceEnabled() {
  return readFlag(FACE_ENABLED_KEY);
}

async function setFaceEnabled(enabled) {
  if (typeof enabled !== 'boolean') {
    throw httpError('face_enabled phải là boolean', 400);
  }
  await writeFlag(FACE_ENABLED_KEY, enabled);
  return { face_enabled: enabled };
}

async function getSettings() {
  const lock = await getGiftLockState();
  const opensSince = await getGiftOpensSince();
  return {
    gift_pages_locked: lock.locked,
    gift_unlock_at: lock.unlockAt ? lock.unlockAt.toISOString() : null,
    gift_opens_since: opensSince ? opensSince.toISOString() : null,
    face_enabled: await isFaceEnabled(),
  };
}

module.exports = {
  getGiftLockState,
  isGiftPagesLocked,
  setGiftPagesLocked,
  setGiftUnlockAt,
  getGiftOpensSince,
  resetGiftOpens,
  isFaceEnabled,
  setFaceEnabled,
  getSettings,
  parseIso,
};
