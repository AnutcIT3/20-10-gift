const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');
const pool = require('../config/db');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return sendError(res, 'Unauthorized', 401);
  }

  const token = header.split(' ')[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return sendError(res, 'Invalid or expired token', 401);
  }

  // Token chỉ có giá trị khi admin còn tồn tại: xóa admin là thu hồi được
  // mọi token đã phát (token sống 24h, không có blacklist)
  try {
    const [rows] = await pool.execute(
      'SELECT id FROM admins WHERE id = ? LIMIT 1',
      [decoded.sub],
    );
    if (!rows.length) {
      return sendError(res, 'Invalid or expired token', 401);
    }
  } catch (error) {
    // Lỗi DB tạm thời KHÔNG phải lỗi token: phải trả 500 — nếu trả 401,
    // frontend sẽ xóa phiên và đá admin về trang login chỉ vì DB chớp nhoáng
    return next(error);
  }

  req.admin = decoded;
  next();
}

module.exports = authMiddleware;
