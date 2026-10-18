const { sendSuccess, sendError } = require('../utils/response');
const resolveService = require('../services/resolveService');
const settingsService = require('../services/settingsService');

async function resolve(req, res) {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return sendError(res, 'Vui lòng nhập tên cần tìm', 400);
  }

  // Khoá chờ 20/10 không chặn tra tên (form gửi lời chúc cần nó) nhưng giấu
  // ảnh đại diện và chỗ ngồi trong danh sách trùng tên
  const { locked } = await settingsService.getGiftLockState();
  const result = await resolveService.resolve(name, req.body.scope, { locked });

  if (result.error) {
    return sendError(res, result.error, result.status);
  }

  return sendSuccess(res, result);
}

module.exports = { resolve };
