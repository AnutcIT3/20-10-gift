const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const giftController = require('../controllers/giftController');
const reactionController = require('../controllers/reactionController');
const honeypot = require('../middleware/honeypot');
const perGiftLimiter = require('../middleware/perGiftLimiter');
const { reactionLimiter } = require('../middleware/rateLimit');

const router = Router();

router.get('/:accessCode', asyncHandler(giftController.getStudent));
router.get('/:accessCode/content', asyncHandler(giftController.getContent));
router.get('/:accessCode/gallery', asyncHandler(giftController.getGallery));
router.get('/:accessCode/letters', asyncHandler(giftController.getLetters));
router.post('/:accessCode/letters', honeypot, perGiftLimiter, asyncHandler(giftController.createLetter));
router.post('/:accessCode/letters/:letterId/react', reactionLimiter, asyncHandler(reactionController.react));

module.exports = router;
