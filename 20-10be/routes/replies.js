const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const authMiddleware = require('../middleware/auth');
const giftLockGuard = require('../middleware/giftLock');
const replyController = require('../controllers/replyController');

// Hộp thư hồi âm công khai — mở cùng lúc với trang quà (khoá là khoá hết)
const repliesRouter = Router();
repliesRouter.get('/', giftLockGuard, asyncHandler(replyController.board));

// Admin duyệt hồi âm như duyệt lời chúc
const adminRepliesRouter = Router();
adminRepliesRouter.use(authMiddleware);
adminRepliesRouter.get('/', asyncHandler(replyController.list));
adminRepliesRouter.patch('/bulk/status', asyncHandler(replyController.bulkUpdateStatus));
adminRepliesRouter.patch('/:id/status', asyncHandler(replyController.updateStatus));
adminRepliesRouter.delete('/:id', asyncHandler(replyController.remove));

module.exports = { repliesRouter, adminRepliesRouter };
