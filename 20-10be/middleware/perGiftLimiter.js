const rateLimit = require('express-rate-limit');

const perGiftLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.params.accessCode}:${req.ip}`,
  message: { success: false, message: 'Quá nhiều lần gửi, vui lòng thử lại sau 1 giờ.' },
});

module.exports = perGiftLimiter;
