const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const adminStatsController = require('../controllers/adminStatsController');
const settingsController = require('../controllers/settingsController');
const { asyncHandler } = require('../utils/response');

const router = Router();
router.use(authMiddleware);

router.get('/stats', asyncHandler(adminStatsController.getStats));
router.get('/data-revision', asyncHandler(adminStatsController.getDataRevision));
router.get('/export/students', asyncHandler(adminStatsController.exportStudents));
router.get('/settings', asyncHandler(settingsController.getSettings));
router.patch('/settings', asyncHandler(settingsController.updateSettings));

module.exports = router;
