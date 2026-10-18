const { Router } = require('express');
const multer = require('multer');
const { asyncHandler } = require('../utils/response');
const { faceMatchLimiter, faceEventLimiter } = require('../middleware/rateLimit');
const { uploadErrorHandler } = require('../config/cloudinary');
const { FACE_FRAME_MAX_BYTES } = require('../config/constants');
const faceController = require('../controllers/faceController');
const giftLockGuard = require('../middleware/giftLock');

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

// Khoá chờ 20/10 chặn cả nhận diện: kết quả quét chào đúng tên (và cả nhóm)
// trước giờ mở quà. giftLockGuard đứng trước multer để request bị chặn (423)
// hay 429 không tốn công đọc thân multipart.
router.post(
  '/match',
  faceMatchLimiter,
  giftLockGuard,
  uploadFrame.single('frame'),
  uploadErrorHandler,
  asyncHandler(faceController.match),
);

router.post('/confirm', asyncHandler(faceController.confirm));

// Lịch sử cho admin: trình duyệt báo lượt quét kết thúc thế nào, và ghép tên
// khi người dùng gõ tên mở quà ngay sau lượt chưa thành. Chỉ JSON nhỏ, không ảnh.
router.post('/scans/claim', faceEventLimiter, asyncHandler(faceController.claimScans));
router.post('/scans/:token/end', faceEventLimiter, asyncHandler(faceController.endScan));

module.exports = router;
