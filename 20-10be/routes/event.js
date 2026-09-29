const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const { eventLimiter } = require('../middleware/rateLimit');
const eventController = require('../controllers/eventController');

const router = Router();

// Trạng thái công khai cho trang chủ: đếm ngược tới giờ tự mở, bông hoa 12A1.
// Không qua giftLockGuard — lúc khoá chính là lúc trang chủ cần đếm ngược.
router.get('/', eventLimiter, asyncHandler(eventController.status));

module.exports = router;
