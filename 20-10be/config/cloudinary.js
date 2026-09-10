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
        if (error) {
          // Multer hủy cả lô khi một file lỗi; nếu thông báo không nêu tên file
          // thì admin không biết bỏ tấm nào và bấm lại sẽ lỗi y hệt
          const code = Number(error.http_code);
          return callback(Object.assign(
            new Error(`Ảnh "${file.originalname}" không hợp lệ hoặc bị hỏng (${error.message}). Hãy bỏ ảnh này khỏi hàng đợi rồi tải lại.`),
            { statusCode: code >= 400 && code < 500 ? 400 : 502 },
          ));
        }
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
    // Chặn sớm student_id rõ ràng không hợp lệ để khỏi tốn công đẩy file lên
    // Cloudinary rồi mới trả 400 (multipart gửi field trước file thì body đã
    // có ở bước này; thiếu field thì controller vẫn chặn sau khi upload)
    const sid = req.body?.student_id;
    if (sid !== undefined && (!/^\d+$/.test(String(sid)) || Number(sid) <= 0)) {
      return cb(Object.assign(new Error('student_id không hợp lệ'), { statusCode: 400 }));
    }
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
      return cb(Object.assign(new Error(`Ảnh "${file.originalname}" không đúng định dạng (chỉ nhận ${allowedExts.join(', ')})`), { statusCode: 400 }));
    }
    // Windows không có codec HEIC báo MIME rỗng hoặc octet-stream cho ảnh iPhone;
    // đuôi file đã qua kiểm tra và Cloudinary còn kiểm tra nội dung thật
    const vagueMime = !file.mimetype || file.mimetype === 'application/octet-stream';
    if (allowedMimes && !vagueMime && !allowedMimes.includes(file.mimetype)) {
      return cb(Object.assign(new Error(`Ảnh "${file.originalname}" có kiểu ${file.mimetype} không được hỗ trợ`), { statusCode: 400 }));
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
  fileFilter: fileFilter(ALLOWED_IMAGE_TYPES, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']),
});

module.exports = {
  cloudinary, uploadImage, uploadErrorHandler,
};
