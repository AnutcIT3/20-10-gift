const { sendSuccess, sendError } = require('../utils/response');
const resolveService = require('../services/resolveService');

async function resolve(req, res) {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return sendError(res, 'Vui lòng nhập tên cần tìm', 400);
  }

  const result = await resolveService.resolve(name);

  if (result.error) {
    return sendError(res, result.error, result.status);
  }

  return sendSuccess(res, result);
}

module.exports = { resolve };
