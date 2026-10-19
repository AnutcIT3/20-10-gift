const { sendSuccess, sendError } = require('../utils/response');
const resolveService = require('../services/resolveService');
const settingsService = require('../services/settingsService');

async function resolve(req, res) {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return sendError(res, 'Vui lòng nhập tên cần tìm', 400);
  }

  // Admin bật "Chỉ mở bằng Face ID": thành viên lớp không mở quà bằng gõ tên
  // được nữa. Khách ngoài lớp (phần lớn không có Face ID) vẫn gõ tên — ô đó
  // chỉ tra trong danh sách khách nên bạn trong lớp không lách qua được
  if (req.body.scope !== 'friend' && await settingsService.isFaceOnly()) {
    return sendError(res, 'Hiện chỉ mở quà bằng Face ID — bấm thẻ ✨ Face ID để mở nhé.', 403);
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
