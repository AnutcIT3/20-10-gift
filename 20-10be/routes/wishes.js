const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const { multiWishLimiter } = require('../middleware/rateLimit');
const { uploadErrorHandler } = require('../config/cloudinary');
const { letterImageUpload } = require('../utils/letterUpload');
const honeypot = require('../middleware/honeypot');
const wishController = require('../controllers/wishController');

const router = Router();

// Gửi một lời chúc cho nhiều bạn cùng lúc. Như các đường gửi lời chúc khác:
// limiter TRƯỚC multer (request 429 không được upload ảnh), honeypot sau multer
// và tự dọn ảnh; KHÔNG gắn giftLockGuard — khoá chờ 20/10 chỉ chặn XEM.
router.post('/', multiWishLimiter, letterImageUpload, uploadErrorHandler, honeypot, asyncHandler(wishController.create));

module.exports = router;
