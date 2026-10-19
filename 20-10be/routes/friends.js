const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const friendController = require('../controllers/friendController');
const honeypot = require('../middleware/honeypot');
const { uploadErrorHandler } = require('../config/cloudinary');
const { letterImageUpload } = require('../utils/letterUpload');

const router = Router();

// Gửi lời chúc cho người ngoài lớp (tự tạo hồ sơ "bạn bè").
// Không giới hạn số thư (chỉ còn hạn mức chung của /api chặn bot dội).
// Honeypot đứng sau multer (multipart body chỉ có sau parse) và tự dọn req.file.
// Cố ý KHÔNG gắn giftLockGuard: khóa chờ 20/10 chỉ chặn XEM, không chặn GỬI.
router.post(
  '/letters',
  letterImageUpload,
  uploadErrorHandler,
  honeypot,
  asyncHandler(friendController.createLetter),
);

module.exports = router;
