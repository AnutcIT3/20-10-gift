const { cloudinary } = require('../config/cloudinary');

// Payload multipart (khi kèm ảnh) đưa mọi field về dạng chuỗi — đưa các field
// đặc biệt về đúng kiểu mà sanitizeLetterPayload mong đợi.
function normalizeMultipartLetterBody(req) {
  if (!req.is('multipart/form-data')) return req.body;
  const body = { ...req.body };
  if (body.is_anonymous !== undefined) body.is_anonymous = body.is_anonymous === 'true';
  if (body.reveal_at === '') body.reveal_at = null;
  return body;
}

function extractLetterImage(req) {
  return req.file ? { url: req.file.path, publicId: req.file.filename } : null;
}

async function cleanupLetterImage(image) {
  if (!image?.publicId) return;
  try {
    await cloudinary.uploader.destroy(image.publicId);
  } catch (error) {
    console.error(`Cloudinary cleanup failed for ${image.publicId}:`, error.message);
  }
}

module.exports = { normalizeMultipartLetterBody, extractLetterImage, cleanupLetterImage };
