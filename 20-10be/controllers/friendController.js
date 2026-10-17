const friendService = require('../services/friendService');
const { sendSuccess } = require('../utils/response');
const {
  normalizeMultipartLetterBody, extractLetterImages, cleanupLetterImages, assertImageCount,
} = require('../utils/letterUpload');

async function createLetter(req, res) {
  const images = extractLetterImages(req);
  await assertImageCount(images);
  try {
    const result = await friendService.createFriendLetter(normalizeMultipartLetterBody(req), images);
    return sendSuccess(res, result, 201);
  } catch (error) {
    // Validation/DB lỗi → dọn ảnh đã lỡ upload lên Cloudinary
    await cleanupLetterImages(images);
    throw error;
  }
}

module.exports = { createLetter };
