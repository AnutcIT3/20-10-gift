const rateLimit = require('express-rate-limit');
const ipKey = require('../utils/ipKey');

const perGiftLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Khóa theo (trang quà, IP) để cả lớp chung WiFi vẫn gửi được cho nhiều bạn;
  // IPv6 gộp về /64 để không né được hạn mức bằng cách xoay địa chỉ
  keyGenerator: (req) => `${req.params.accessCode}:${ipKey(req.ip)}`,
  message: { success: false, message: 'Quá nhiều lần gửi, vui lòng thử lại sau 1 giờ.' },
});

module.exports = perGiftLimiter;
