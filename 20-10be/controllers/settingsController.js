const settingsService = require('../services/settingsService');
const { sendSuccess, sendError } = require('../utils/response');

async function getSettings(req, res) {
  return sendSuccess(res, await settingsService.getSettings());
}

// Mỗi công tắc một khóa; phản hồi chỉ chứa đúng khóa vừa đổi để sidebar admin
// đọc thẳng giá trị mới mà không phải tải lại toàn bộ settings
async function updateSettings(req, res) {
  const body = req.body || {};
  if (Object.hasOwn(body, 'gift_pages_locked')) {
    return sendSuccess(res, await settingsService.setGiftPagesLocked(body.gift_pages_locked));
  }
  if (Object.hasOwn(body, 'face_enabled')) {
    return sendSuccess(res, await settingsService.setFaceEnabled(body.face_enabled));
  }
  return sendError(res, 'Cần gift_pages_locked hoặc face_enabled', 400);
}

module.exports = { getSettings, updateSettings };
