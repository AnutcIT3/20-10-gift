const multiWishService = require('../services/multiWishService');
const { sendSuccess } = require('../utils/response');
const {
  normalizeMultipartLetterBody, extractLetterImages, cleanupLetterImages, assertImageCount,
} = require('../utils/letterUpload');

// POST /api/wishes — một lời chúc gửi cho nhiều bạn cùng lúc
async function create(req, res) {
  const images = extractLetterImages(req);
  await assertImageCount(images);
  try {
    return sendSuccess(res, await multiWishService.createWishes(normalizeMultipartLetterBody(req), images), 201);
  } catch (error) {
    // Validation/DB lỗi → dọn ảnh đã lỡ upload lên Cloudinary
    await cleanupLetterImages(images);
    throw error;
  }
}

// GET /api/wishes/recipients — các bạn trong lớp và cô giáo để tích chọn
async function recipients(req, res) {
  return sendSuccess(res, await multiWishService.listRecipients());
}

// POST /api/wishes/guest — ô "Ngoài lớp": tra một khách đã có theo tên
async function findGuest(req, res) {
  return sendSuccess(res, await multiWishService.findGuests(req.body?.name));
}

module.exports = { create, recipients, findGuest };
