const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const friendController = require('../controllers/friendController');
const honeypot = require('../middleware/honeypot');
const { publicLimiter } = require('../middleware/rateLimit');
const { uploadImage, uploadErrorHandler } = require('../config/cloudinary');

const router = Router();

// Gửi lời chúc cho người ngoài lớp (tự tạo hồ sơ "bạn bè").
// THỨ TỰ QUAN TRỌNG: limiter phải đứng TRƯỚC multer — nếu không, request bị
// 429 vẫn upload ảnh xong lên Cloudinary và ảnh thành mồ côi không dọn được.
// Honeypot đứng sau multer (multipart body chỉ có sau parse) và tự dọn req.file.
// Cố ý KHÔNG gắn giftLockGuard: khóa chờ 20/10 chỉ chặn XEM, không chặn GỬI.
router.post(
  '/letters',
  publicLimiter,
  uploadImage.single('image'),
  uploadErrorHandler,
  honeypot,
  asyncHandler(friendController.createLetter),
);

module.exports = router;
