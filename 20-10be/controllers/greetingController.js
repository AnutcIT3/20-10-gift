const greetingService = require('../services/greetingService');
const { sendSuccess, sendError } = require('../utils/response');

async function generate(req, res) {
  const { name, audienceType = 'student' } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2) {
    return sendError(res, 'Tên phải có ít nhất 2 ký tự', 400);
  }
  const cleanName = name.trim();
  if (cleanName.length > 100) return sendError(res, 'Tên tối đa 100 ký tự', 400);
  if (!['student', 'visitor'].includes(audienceType)) {
    return sendError(res, 'audienceType không hợp lệ', 400);
  }
  return sendSuccess(res, await greetingService.generateGreeting(cleanName, audienceType));
}

module.exports = { generate };
