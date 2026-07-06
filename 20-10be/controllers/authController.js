const authService = require('../services/authService');
const { sendSuccess, sendError } = require('../utils/response');

async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim()
    || typeof password !== 'string' || !password) {
    return sendError(res, 'Username and password are required', 400);
  }

  const result = await authService.login(username.trim(), password);
  if (!result) return sendError(res, 'Invalid credentials', 401);
  return sendSuccess(res, result);
}

async function me(req, res) {
  return sendSuccess(res, { adminId: req.admin.sub });
}

module.exports = { login, me };
