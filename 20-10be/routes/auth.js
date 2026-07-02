const { Router } = require('express');
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/response');

const router = Router();

router.post('/admin/login', authLimiter, asyncHandler(authController.login));

module.exports = router;
