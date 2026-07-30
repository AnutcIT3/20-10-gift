const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE } = require('./constants');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function createStorage(resourceType, allowedFormats) {
  return {
    _handleFile(req, file, callback) {
      const upload = cloudinary.uploader.upload_stream({
        folder: 'gift_20_10',
        resource_type: resourceType,
        allowed_formats: allowedFormats,
      }, (error, result) => {
        if (error) return callback(error);
        return callback(null, {
          path: result.secure_url,
          filename: result.public_id,
          size: result.bytes,
          resourceType: result.resource_type,
        });
      });

      file.stream.pipe(upload);
    },
    _removeFile(req, file, callback) {
      if (!file.filename) return callback(null);
      return cloudinary.uploader.destroy(
        file.filename,
        { resource_type: resourceType },
        callback,
      );
    },
  };
}

function fileFilter(allowedExts, allowedMimes) {
  return (req, file, cb) => {
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
      return cb(Object.assign(new Error('Invalid file format'), { statusCode: 400 }));
    }
    if (allowedMimes && !allowedMimes.includes(file.mimetype)) {
      return cb(Object.assign(new Error(`Invalid MIME type: ${file.mimetype}`), { statusCode: 400 }));
    }
    cb(null, true);
  };
}

function uploadErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File too large' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
  next();
}

const uploadImage = multer({
  storage: createStorage('image', ALLOWED_IMAGE_TYPES),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']),
});

module.exports = {
  cloudinary, uploadImage, uploadErrorHandler,
};
