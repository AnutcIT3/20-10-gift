const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const resolveController = require('../controllers/resolveController');

const router = Router();

router.post('/resolve', asyncHandler(resolveController.resolve));

module.exports = router;
