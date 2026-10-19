const { Router } = require('express');
const greetingController = require('../controllers/greetingController');
const { greetingLimiter } = require('../middleware/rateLimit');
const giftLockGuard = require('../middleware/giftLock');
const authMiddleware = require('../middleware/auth');
const { asyncHandler } = require('../utils/response');

const router = Router();
// Khóa chờ 20/10 là khóa HẾT mọi đường nhận lời chúc, kể cả trang celebrate
router.post('/generate', giftLockGuard, greetingLimiter, asyncHandler(greetingController.generate));

// Admin xem thử lời chúc tự động (Lời chúc → Riêng từng bạn) — cần đăng nhập
// và KHÔNG qua khoá: admin soạn lời chúc chính là trong lúc trang quà đang khoá
const adminGreetingsRouter = Router();
adminGreetingsRouter.use(authMiddleware);
adminGreetingsRouter.post('/preview', greetingLimiter, asyncHandler(greetingController.generate));

module.exports = router;
module.exports.adminGreetingsRouter = adminGreetingsRouter;
