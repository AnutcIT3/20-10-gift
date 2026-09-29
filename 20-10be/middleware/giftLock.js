const settingsService = require('../services/settingsService');

// Chặn các endpoint XEM trang quà khi admin đang khóa chờ ngày 20/10.
// Cố ý KHÔNG áp vào POST letters/resolve: các bạn nam vẫn gửi lời chúc được
// trong lúc khóa — đó chính là mục đích của tính năng.
// Kèm giờ tự mở (nếu admin đã hẹn) và giờ máy chủ để màn "Chưa đến ngày" đếm
// ngược đúng khoảnh khắc quà mở, kể cả khi đồng hồ điện thoại chạy lệch.
async function giftLockGuard(req, res, next) {
  try {
    const { locked, unlockAt } = await settingsService.getGiftLockState();
    if (locked) {
      return res.status(423).json({
        success: false,
        message: 'Chưa đến ngày 20/10, vui lòng chờ thêm nhé!',
        unlockAt: unlockAt ? unlockAt.toISOString() : null,
        serverNow: new Date().toISOString(),
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = giftLockGuard;
