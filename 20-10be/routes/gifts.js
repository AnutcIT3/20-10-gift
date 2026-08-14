const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const giftController = require('../controllers/giftController');
const reactionController = require('../controllers/reactionController');
const honeypot = require('../middleware/honeypot');
const perGiftLimiter = require('../middleware/perGiftLimiter');
const giftLockGuard = require('../middleware/giftLock');
const { reactionLimiter } = require('../middleware/rateLimit');

const router = Router();

// giftLockGuard chỉ chặn các route XEM; gửi lời chúc (POST letters) vẫn mở
// trong lúc khóa để các bạn nam chúc trước ngày 20/10
router.get('/:accessCode', giftLockGuard, asyncHandler(giftController.getStudent));
router.get('/:accessCode/content', giftLockGuard, asyncHandler(giftController.getContent));
router.get('/:accessCode/gallery', giftLockGuard, asyncHandler(giftController.getGallery));
router.get('/:accessCode/letters', giftLockGuard, asyncHandler(giftController.getLetters));
router.post('/:accessCode/letters', honeypot, perGiftLimiter, asyncHandler(giftController.createLetter));
router.post('/:accessCode/letters/:letterId/react', reactionLimiter, asyncHandler(reactionController.react));

module.exports = router;
