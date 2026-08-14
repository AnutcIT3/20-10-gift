const pool = require('../config/db');

const GIFT_LOCK_KEY = 'gift_pages_locked';

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

async function isGiftPagesLocked() {
  const [rows] = await pool.execute(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    [GIFT_LOCK_KEY],
  );
  return rows[0]?.setting_value === '1';
}

async function setGiftPagesLocked(locked) {
  if (typeof locked !== 'boolean') {
    throw httpError('gift_pages_locked phải là boolean', 400);
  }
  const value = locked ? '1' : '0';
  await pool.execute(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = ?`,
    [GIFT_LOCK_KEY, value, value],
  );
  return { gift_pages_locked: locked };
}

async function getSettings() {
  return { gift_pages_locked: await isGiftPagesLocked() };
}

module.exports = { isGiftPagesLocked, setGiftPagesLocked, getSettings };
