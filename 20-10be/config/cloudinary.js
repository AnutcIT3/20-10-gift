const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const {
  ALLOWED_IMAGE_TYPES, ALLOWED_AUDIO_TYPES, ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE, MAX_AUDIO_SIZE, MAX_VIDEO_SIZE,
} = require('./constants');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MIME_MAP = {
  'image/jpeg': 'image', 'image/jpg': 'image', 'image/png': 'image',
  'image/gif': 'image', 'image/webp': 'image',
  'audio/mpeg': 'video', 'audio/wav': 'video', 'audio/wave': 'video',
  'video/mp4': 'video', 'video/webm': 'video',
};

function mimeToResourceType(mime) {
  return MIME_MAP[mime] || 'auto';
}

function createStorage(resourceType) {
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'gift_20_10',
      resource_type: resourceType,
      allowed_formats: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES],
    },
  });
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
  storage: createStorage('image'),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']),
});

const uploadAudio = multer({
  storage: createStorage('video'),
  limits: { fileSize: MAX_AUDIO_SIZE },
  fileFilter: fileFilter(ALLOWED_AUDIO_TYPES, ['audio/mpeg', 'audio/wav', 'audio/wave']),
});

const uploadVideo = multer({
  storage: createStorage('video'),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: fileFilter(ALLOWED_VIDEO_TYPES, ['video/mp4', 'video/webm']),
});

module.exports = {
  cloudinary, uploadImage, uploadAudio, uploadVideo, uploadErrorHandler,
};
