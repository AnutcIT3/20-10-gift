const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt');

// Hash giả cho nhánh "không có username": cả hai nhánh đều tốn một lần bcrypt
// để không lộ username hợp lệ qua chênh lệch thời gian phản hồi
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-placeholder', 10);

async function login(username, password) {
  const [rows] = await pool.execute(
    'SELECT id, password_hash FROM admins WHERE username = ? LIMIT 1',
    [username],
  );
  const admin = rows[0];
  const matches = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !matches) {
    return null;
  }
  return { token: signToken({ sub: admin.id }) };
}

module.exports = { login };
