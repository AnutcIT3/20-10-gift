const { verifyToken } = require('../utils/jwt');
const { sendError } = require('../utils/response');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return sendError(res, 'Unauthorized', 401);
  }

  const token = header.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.admin = decoded;
    next();
  } catch {
    return sendError(res, 'Invalid or expired token', 401);
  }
}

module.exports = authMiddleware;
