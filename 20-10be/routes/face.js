const { Router } = require('express');
const multer = require('multer');
const { asyncHandler } = require('../utils/response');
const { faceMatchLimiter } = require('../middleware/rateLimit');
const { uploadErrorHandler } = require('../config/cloudinary');
const { FACE_FRAME_MAX_BYTES } = require('../config/constants');
const faceController = require('../controllers/faceController');

const FRAME_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

// Khung hình chỉ sống trong bộ nhớ của request: memoryStorage, không đĩa,
// không Cloudinary — chuyển thẳng sang face-service rồi bỏ
const uploadFrame = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FACE_FRAME_MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!FRAME_MIMES.has(file.mimetype)) {
      return cb(Object.assign(new Error('Khung hình phải là ảnh JPEG, PNG hoặc WebP'), { statusCode: 400 }));
    }
    return cb(null, true);
  },
});

const router = Router();

router.get('/status', asyncHandler(faceController.status));

// Cố ý KHÔNG gắn giftLockGuard: khóa chờ 20/10 chặn XEM trang quà, còn nhận
// diện chỉ trả về đường dẫn — trang quà tự chặn khi mở. Limiter đứng trước
// multer để request bị 429 không tốn công đọc thân multipart.
router.post(
  '/match',
  faceMatchLimiter,
  uploadFrame.single('frame'),
  uploadErrorHandler,
  asyncHandler(faceController.match),
);

router.post('/confirm', asyncHandler(faceController.confirm));

module.exports = router;
