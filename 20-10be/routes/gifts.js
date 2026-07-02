const { Router } = require('express');
const { asyncHandler } = require('../utils/response');
const giftController = require('../controllers/giftController');
const honeypot = require('../middleware/honeypot');
const perGiftLimiter = require('../middleware/perGiftLimiter');

const router = Router();

router.get('/:accessCode', asyncHandler(giftController.getStudent));
router.get('/:accessCode/gallery', asyncHandler(giftController.getGallery));
router.get('/:accessCode/letters', asyncHandler(giftController.getLetters));
router.post('/:accessCode/letters', honeypot, perGiftLimiter, asyncHandler(giftController.createLetter));

module.exports = router;
