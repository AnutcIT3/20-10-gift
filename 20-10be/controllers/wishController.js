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

module.exports = { create };
