const pool = require('../config/db');

const GIFT_LOCK_KEY = 'gift_pages_locked';
const FACE_ENABLED_KEY = 'face_enabled';

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function readFlag(key) {
  const [rows] = await pool.execute(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    [key],
  );
  return rows[0]?.setting_value === '1';
}

async function writeFlag(key, enabled) {
  const value = enabled ? '1' : '0';
  await pool.execute(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = ?`,
    [key, value, value],
  );
}

async function isGiftPagesLocked() {
  return readFlag(GIFT_LOCK_KEY);
}

async function setGiftPagesLocked(locked) {
  if (typeof locked !== 'boolean') {
    throw httpError('gift_pages_locked phải là boolean', 400);
  }
  await writeFlag(GIFT_LOCK_KEY, locked);
  return { gift_pages_locked: locked };
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
  return {
    gift_pages_locked: await isGiftPagesLocked(),
    face_enabled: await isFaceEnabled(),
  };
}

module.exports = {
  isGiftPagesLocked,
  setGiftPagesLocked,
  isFaceEnabled,
  setFaceEnabled,
  getSettings,
};
