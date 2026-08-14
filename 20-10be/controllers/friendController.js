const friendService = require('../services/friendService');
const { sendSuccess } = require('../utils/response');
const {
  normalizeMultipartLetterBody, extractLetterImage, cleanupLetterImage,
} = require('../utils/letterUpload');

async function createLetter(req, res) {
  const image = extractLetterImage(req);
  try {
    const result = await friendService.createFriendLetter(normalizeMultipartLetterBody(req), image);
    return sendSuccess(res, result, 201);
  } catch (error) {
    // Validation/DB lỗi → dọn ảnh đã lỡ upload lên Cloudinary
    await cleanupLetterImage(image);
    throw error;
  }
}

module.exports = { createLetter };
