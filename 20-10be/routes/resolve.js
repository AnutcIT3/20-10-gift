const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const { resolveLimiter } = require('../middleware/rateLimit');
const resolveController = require('../controllers/resolveController');

const router = Router();

router.post('/resolve', resolveLimiter, asyncHandler(resolveController.resolve));

module.exports = router;
