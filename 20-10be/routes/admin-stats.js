const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const adminStatsController = require('../controllers/adminStatsController');
const { asyncHandler } = require('../utils/response');

const router = Router();
router.use(authMiddleware);

router.get('/stats', asyncHandler(adminStatsController.getStats));
router.get('/export/students', asyncHandler(adminStatsController.exportStudents));

module.exports = router;
