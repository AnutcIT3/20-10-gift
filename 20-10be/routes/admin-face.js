const { Router } = require('express');
const authMiddleware = require('../middleware/auth');
const faceHistoryController = require('../controllers/faceHistoryController');
const { asyncHandler } = require('../utils/response');

// Lịch sử Face ID — chỉ admin. Không nằm trong data-revision: lịch sử quét
// không phải dữ liệu dùng chung giữa các máy admin.
const router = Router();
router.use(authMiddleware);

router.get('/summary', asyncHandler(faceHistoryController.summary));
router.get('/scans', asyncHandler(faceHistoryController.list));
router.get('/scans/:id', asyncHandler(faceHistoryController.detail));
router.delete('/scans', asyncHandler(faceHistoryController.clear));

module.exports = router;
