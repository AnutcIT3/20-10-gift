const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // data-revision được admin poll mỗi 5s (180 req/15 phút/tab) nên tách sang
  // revisionLimiter riêng để không ăn hạn mức chung của người dùng thật
  skip: (req) => req.path === '/health' || req.path === '/ready' || req.path === '/admin/data-revision',
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const reactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều lượt thả cảm xúc, vui lòng thử lại sau.' },
});

// Resolve trả về access code (cơ chế xác thực duy nhất của trang quà)
// nên cần hạn mức riêng chặt hơn generalLimiter để chặn dò quét hàng loạt.
const resolveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều lượt tìm tên, vui lòng thử lại sau.' },
});

// Hạn mức riêng cho polling data-revision: đủ cho vài tab admin cùng lúc
// (5s/lượt = 180 req/15 phút/tab) nhưng vẫn chặn được lạm dụng.
const revisionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 900,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

module.exports = {
  authLimiter, publicLimiter, generalLimiter, reactionLimiter, resolveLimiter, revisionLimiter,
};
