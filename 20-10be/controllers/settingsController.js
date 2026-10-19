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
  if (Object.hasOwn(body, 'gift_unlock_at')) {
    return sendSuccess(res, await settingsService.setGiftUnlockAt(body.gift_unlock_at));
  }
  if (Object.hasOwn(body, 'gift_opens_until')) {
    return sendSuccess(res, await settingsService.setGiftOpensUntil(body.gift_opens_until));
  }
  if (body.reset_gift_opens === true) {
    return sendSuccess(res, await settingsService.resetGiftOpens());
  }
  if (Object.hasOwn(body, 'face_enabled')) {
    return sendSuccess(res, await settingsService.setFaceEnabled(body.face_enabled));
  }
  if (Object.hasOwn(body, 'face_only')) {
    return sendSuccess(res, await settingsService.setFaceOnly(body.face_only));
  }
  if (Object.hasOwn(body, 'face_liveness')) {
    return sendSuccess(res, await settingsService.setFaceLiveness(body.face_liveness));
  }
  return sendError(res, 'Cần gift_pages_locked, gift_unlock_at, reset_gift_opens, face_enabled, face_only hoặc face_liveness', 400);
}

module.exports = { getSettings, updateSettings };
