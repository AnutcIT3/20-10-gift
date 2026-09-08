const rateLimit = require('express-rate-limit');
const ipKey = require('../utils/ipKey');

// Mọi limiter dùng chung keyGenerator gộp IPv6 về /64 — địa chỉ IPv6 đầy đủ
// cho phép xoay địa chỉ trong dải được cấp để né hạn mức
const ipKeyGenerator = (req) => ipKey(req.ip);

// HẠN MỨC TÍNH THEO IP, MÀ CẢ LỚP Ở TRƯỜNG ĐI CHUNG MỘT IP (NAT Wi-Fi) — qua
// Cloudflare tunnel backend cũng chỉ thấy IP đó. Con số vì thế phải đủ cho
// ~60 người dùng cùng lúc chứ không phải một người. Trần thật nằm ở gói free:
// Aiven 76 kết nối (pool 30/máy), tunnel ~200 request đang bay, còn Gemini hết
// quota thì greetingService tự trả lời chúc tĩnh — nên nới ở đây là an toàn.
const WINDOW_15_MIN = 15 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

// Lời chúc AI: mỗi lượt mở trang quà / trang celebrate gọi một lần
const greetingLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// Thư gửi bạn ngoài lớp tự tạo hồ sơ "bạn bè" — giữ chặt hơn lời chúc AI
const friendLetterLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Quá nhiều lượt gửi, vui lòng thử lại sau.' },
});

const generalLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  // data-revision được admin poll mỗi 5s (180 req/15 phút/tab) nên tách sang
  // revisionLimiter riêng để không ăn hạn mức chung của người dùng thật
  skip: (req) => req.path === '/health' || req.path === '/ready' || req.path === '/admin/data-revision',
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const reactionLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Quá nhiều lượt thả cảm xúc, vui lòng thử lại sau.' },
});

// Resolve trả về access code (cơ chế xác thực duy nhất của trang quà) nên vẫn
// cần hạn mức riêng để chặn dò quét hàng loạt — 1000/15 phút đủ cho cả trường
// gõ đi gõ lại nhưng vẫn khiến quét bằng script phải kéo dài nhiều giờ.
const resolveLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Quá nhiều lượt tìm tên, vui lòng thử lại sau.' },
});

// Polling data-revision: 5s/lượt = 180 req/15 phút/tab; nhiều admin, nhiều tab
// cùng IP vẫn còn dư.
const revisionLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

module.exports = {
  authLimiter,
  greetingLimiter,
  friendLetterLimiter,
  generalLimiter,
  reactionLimiter,
  resolveLimiter,
  revisionLimiter,
};
