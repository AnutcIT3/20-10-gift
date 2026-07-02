const greetingService = require('../services/greetingService');
const { sendSuccess, sendError } = require('../utils/response');

async function generate(req, res) {
  const { name } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2) {
    return sendError(res, 'Tên phải có ít nhất 2 ký tự', 400);
  }
  const cleanName = name.trim();
  if (cleanName.length > 100) return sendError(res, 'Tên tối đa 100 ký tự', 400);
  return sendSuccess(res, await greetingService.generateGreeting(cleanName));
}

module.exports = { generate };
