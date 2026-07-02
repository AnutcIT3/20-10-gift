const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt');

async function login(username, password) {
  const [rows] = await pool.execute(
    'SELECT id, password_hash FROM admins WHERE username = ? LIMIT 1',
    [username],
  );
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return null;
  }
  return { token: signToken({ sub: admin.id }) };
}

module.exports = { login };
