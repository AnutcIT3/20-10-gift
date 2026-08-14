const { sendSuccess } = require('../utils/response');
const { cloudinary } = require('../config/cloudinary');

async function honeypot(req, res, next) {
  if (req.body && req.body._website) {
    // Bot sập bẫy nhưng multer (đứng trước) có thể đã lỡ upload ảnh —
    // dọn ngay để không để lại ảnh mồ côi trên Cloudinary
    if (req.file?.filename) {
      try {
        await cloudinary.uploader.destroy(req.file.filename);
      } catch (error) {
        console.error(`Honeypot cleanup failed for ${req.file.filename}:`, error.message);
      }
    }
    return sendSuccess(res, { status: 'pending' }, 201);
  }
  return next();
}

module.exports = honeypot;
