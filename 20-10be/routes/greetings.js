const { Router } = require('express');
const greetingController = require('../controllers/greetingController');
const { publicLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../utils/response');

const router = Router();
router.post('/generate', publicLimiter, asyncHandler(greetingController.generate));

module.exports = router;
