const rateLimit = require('express-rate-limit');
const ipKey = require('../utils/ipKey');

// Mọi limiter dùng chung keyGenerator gộp IPv6 về /64 — địa chỉ IPv6 đầy đủ
// cho phép xoay địa chỉ trong dải được cấp để né hạn mức
const ipKeyGenerator = (req) => ipKey(req.ip);

// Mã trang quà trong khoá hạn mức: MySQL so khớp không phân biệt hoa thường,
// nên "12A1-VY" và "12a1-vy" phải chung một bucket. Mã có dấu hay ký tự lạ đã
// bị routes/gifts.js chặn trước khi tới limiter.
function giftKey(req) {
  return String(req.params.accessCode || '').trim().toLowerCase();
}

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

// Đường đã có limiter riêng thì không tính vào hạn mức chung: data-revision
// được admin poll mỗi 5s (180 req/15 phút/tab), còn khung hình Face ID và tín
// hiệu lượt quét đi dồn khi cả lớp quét cùng lúc — không được để chúng làm cạn
// hạn mức mở trang quà của chính các bạn ấy
// /event cũng vậy: cả lớp chờ nửa đêm ở trang chủ, mỗi người hỏi 30 giây/lần.
const GENERAL_SKIP_PATHS = new Set(['/health', '/ready', '/admin/data-revision', '/face/match', '/event']);

const generalLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => GENERAL_SKIP_PATHS.has(req.path) || req.path.startsWith('/face/scans/'),
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

// Quét Face ID: trang chỉ dùng trong nội bộ lớp nên hạn mức ở đây không còn là
// hàng rào chống tấn công, chỉ là cái phanh cho một máy bị kẹt vòng lặp. Cả lớp
// đi chung một IP Wi-Fi; mỗi người gửi ~1,25 khung/giây, một lượt tối đa 30 giây
// (~38 khung). 10000/15 phút ≈ 11 khung/giây — đúng bằng sức face-service trên
// laptop (~90 ms/khung) — nên dùng thật không bao giờ chạm tới.
const faceMatchLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Quá nhiều lượt quét, gõ tên giúp mình nhé.' },
});

// Tín hiệu kết thúc lượt quét và ghép tên: một hai request JSON nhỏ mỗi lượt.
// Cũng chỉ là cái phanh như khung hình — cao hơn hẳn nhu cầu của cả lớp.
const faceEventLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Quá nhiều yêu cầu, thử lại sau nhé.' },
});

// Trạng thái 20/10 (đếm ngược, bông hoa): trang chủ hỏi 30 giây một lần, cả
// lớp chung IP Wi-Fi ~60 người ≈ 1800 lượt/15 phút, cộng dồn quanh 00:00 khi
// đồng hồ về 0 và mọi máy cùng hỏi lại. Kết quả đã đệm 5 giây phía server.
const eventLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Quá nhiều yêu cầu, thử lại sau nhé.' },
});

// Hồi âm: khoá theo (trang quà, IP) như gửi lời chúc — một bạn viết lại cho
// từng người trong hộp thư vẫn thừa sức, script thì bị chặn
const replyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${giftKey(req)}:${ipKey(req.ip)}`,
  message: { success: false, message: 'Cậu hồi âm nhiều quá rồi, nghỉ tay chút rồi thử lại nhé.' },
});

// Bản lưu quà: mỗi lần tải là máy chủ kéo cả chục ảnh từ Cloudinary — nặng
// hơn mọi request khác nên hạn mức riêng, vẫn đủ cho cả lớp tải vài lần
const keepsakeLimiter = rateLimit({
  windowMs: WINDOW_15_MIN,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Đang có nhiều người tải bản lưu quá, thử lại sau ít phút nhé.' },
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
  faceMatchLimiter,
  faceEventLimiter,
  eventLimiter,
  replyLimiter,
  keepsakeLimiter,
  revisionLimiter,
  giftKey,
};
