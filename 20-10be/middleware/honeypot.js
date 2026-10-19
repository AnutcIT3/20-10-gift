const { sendSuccess } = require('../utils/response');
const { extractLetterImages, cleanupLetterImages } = require('../utils/letterUpload');

async function honeypot(req, res, next) {
  if (req.body && req.body._website) {
    // Bot sập bẫy nhưng multer (đứng trước) có thể đã lỡ upload ảnh — cả trường
    // "image" cũ lẫn "images" (tối đa 4) — dọn ngay để không để lại ảnh mồ côi
    const images = extractLetterImages(req);
    if (images.length) await cleanupLetterImages(images);
    return sendSuccess(res, { status: 'pending' }, 201);
  }
  return next();
}

module.exports = honeypot;
