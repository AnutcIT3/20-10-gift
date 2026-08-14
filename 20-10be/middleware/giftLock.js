const settingsService = require('../services/settingsService');
const { sendError } = require('../utils/response');

// Chặn các endpoint XEM trang quà khi admin đang khóa chờ ngày 20/10.
// Cố ý KHÔNG áp vào POST letters/resolve: các bạn nam vẫn gửi lời chúc được
// trong lúc khóa — đó chính là mục đích của tính năng.
async function giftLockGuard(req, res, next) {
  try {
    if (await settingsService.isGiftPagesLocked()) {
      return sendError(res, 'Chưa đến ngày 20/10, vui lòng chờ thêm nhé!', 423);
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = giftLockGuard;
