const { Router } = require('express');
const { asyncHandler, sendError } = require('../utils/response');
const giftController = require('../controllers/giftController');
const reactionController = require('../controllers/reactionController');
const eventController = require('../controllers/eventController');
const replyController = require('../controllers/replyController');
const keepsakeController = require('../controllers/keepsakeController');
const honeypot = require('../middleware/honeypot');
const giftLockGuard = require('../middleware/giftLock');
const { reactionLimiter, keepsakeLimiter } = require('../middleware/rateLimit');
const { uploadErrorHandler } = require('../config/cloudinary');
const { letterImageUpload } = require('../utils/letterUpload');

const router = Router();

// Mã trang quà luôn là chữ-số ASCII (admin đặt [a-z0-9_-], mã tự sinh là
// base64url). Collation của MySQL lại bỏ qua hoa/thường, dấu và dấu cách cuối,
// nên "12a1-lính-tan" vẫn khớp "12a1-linh-tan" — mỗi biến thể lại có một
// bucket hạn mức riêng. Chặn ngay ở đây, trước mọi limiter.
const ACCESS_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
router.param('accessCode', (req, res, next, accessCode) => (
  ACCESS_CODE_RE.test(accessCode) ? next() : sendError(res, 'Not found', 404)
));

// giftLockGuard chỉ chặn các route XEM; gửi lời chúc (POST letters) vẫn mở
// trong lúc khóa để các bạn nam chúc trước ngày 20/10
router.get('/:accessCode', giftLockGuard, asyncHandler(giftController.getStudent));
router.get('/:accessCode/content', giftLockGuard, asyncHandler(giftController.getContent));
router.get('/:accessCode/gallery', giftLockGuard, asyncHandler(giftController.getGallery));
router.get('/:accessCode/letters', giftLockGuard, asyncHandler(giftController.getLetters));
// Không giới hạn số thư: lời chúc là tấm lòng của các bạn, gửi bao nhiêu cũng
// được (chỉ còn hạn mức chung của /api chặn bot dội). Honeypot sau multer
// (multipart body chỉ có sau parse) và tự dọn req.file
router.post('/:accessCode/letters', letterImageUpload, uploadErrorHandler, honeypot, asyncHandler(giftController.createLetter));
router.post('/:accessCode/letters/:letterId/react', reactionLimiter, asyncHandler(reactionController.react));
// Ba việc chỉ làm được SAU khi quà đã mở, nên đều qua giftLockGuard: ghi lượt
// mở quà (bông hoa 12A1), hồi âm người viết thư, và tải bản lưu về máy
router.post('/:accessCode/open', giftLockGuard, asyncHandler(eventController.recordOpen));
router.post('/:accessCode/replies', giftLockGuard, asyncHandler(replyController.create));
router.post('/:accessCode/keepsake', keepsakeLimiter, giftLockGuard, asyncHandler(keepsakeController.download));

module.exports = router;
