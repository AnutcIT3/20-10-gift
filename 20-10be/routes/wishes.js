const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const { resolveLimiter } = require('../middleware/rateLimit');
const { uploadErrorHandler } = require('../config/cloudinary');
const { letterImageUpload } = require('../utils/letterUpload');
const honeypot = require('../middleware/honeypot');
const wishController = require('../controllers/wishController');

const router = Router();

// Gửi một lời chúc cho nhiều bạn cùng lúc. Không giới hạn số thư hay số người
// nhận (chỉ còn hạn mức chung của /api chặn bot dội); honeypot sau multer và
// tự dọn ảnh; KHÔNG gắn giftLockGuard — khoá chờ 20/10 chỉ chặn XEM.
router.post('/', letterImageUpload, uploadErrorHandler, honeypot, asyncHandler(wishController.create));
// Danh sách tích chọn người nhận (tên + biệt danh, không mã quà)
router.get('/recipients', asyncHandler(wishController.recipients));
// Ô "Ngoài lớp": chỉ gửi được cho khách admin đã thêm — tra tên trước khi thêm
router.post('/guest', resolveLimiter, asyncHandler(wishController.findGuest));

module.exports = router;
