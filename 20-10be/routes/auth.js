const { Router } = require('express');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimit');
const authMiddleware = require('../middleware/auth');
const { asyncHandler } = require('../utils/response');

const router = Router();

router.post('/admin/login', authLimiter, asyncHandler(authController.login));
router.get('/admin/me', authMiddleware, asyncHandler(authController.me));

module.exports = router;
