const { Router } = require('express');
const greetingController = require('../controllers/greetingController');
const { greetingLimiter } = require('../middleware/rateLimit');
const giftLockGuard = require('../middleware/giftLock');
const { asyncHandler } = require('../utils/response');

const router = Router();
// Khóa chờ 20/10 là khóa HẾT mọi đường nhận lời chúc, kể cả trang celebrate
router.post('/generate', giftLockGuard, greetingLimiter, asyncHandler(greetingController.generate));

module.exports = router;
