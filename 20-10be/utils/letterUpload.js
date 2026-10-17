const { cloudinary, uploadImage } = require('../config/cloudinary');

// Một lời chúc (thư, hay một trong ba lời chúc riêng) kèm tối đa 4 ảnh
const LETTER_MAX_IMAGES = 4;

// Trường "images" (nhiều ảnh) và "image" (một ảnh — đường cũ của trình duyệt
// chưa tải bản mới). multer chặn quá 4 ở mỗi trường; tổng hai trường kiểm ở
// extractLetterImages
const letterImageUpload = uploadImage.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: LETTER_MAX_IMAGES },
]);

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

// Payload multipart (khi kèm ảnh) đưa mọi field về dạng chuỗi — đưa các field
// đặc biệt về đúng kiểu mà sanitizeLetterPayload mong đợi.
function normalizeMultipartLetterBody(req) {
  if (!req.is('multipart/form-data')) return req.body;
  const body = { ...req.body };
  if (body.is_anonymous !== undefined) body.is_anonymous = body.is_anonymous === 'true';
  if (body.reveal_at === '') body.reveal_at = null;
  // Admin gửi nhiều người nhận: field lặp lại thành mảng, chỉ một người thì
  // multer để nguyên chuỗi
  if (body.student_ids !== undefined && !Array.isArray(body.student_ids)) body.student_ids = [body.student_ids];
  return body;
}

// Mọi ảnh đã upload trong request, đúng thứ tự người gửi chọn: [{ url, publicId }]
function extractLetterImages(req) {
  const files = [
    ...(req.file ? [req.file] : []),
    ...(req.files?.image || []),
    ...(req.files?.images || []),
  ];
  return files.map((file) => ({ url: file.path, publicId: file.filename }));
}

// Dọn mọi ảnh đã lỡ upload khi request hỏng (validation, DB, quá số ảnh)
async function cleanupLetterImages(images) {
  const list = (Array.isArray(images) ? images : [images]).filter((image) => image?.publicId);
  await Promise.all(list.map(async (image) => {
    try {
      await cloudinary.uploader.destroy(image.publicId);
    } catch (error) {
      console.error(`Cloudinary cleanup failed for ${image.publicId}:`, error.message);
    }
  }));
}

// Quá 4 ảnh (gộp cả hai trường) thì dọn hết rồi báo lỗi — không giữ 4 ảnh đầu
// một cách lặng lẽ
async function assertImageCount(images, max = LETTER_MAX_IMAGES) {
  if (images.length <= max) return;
  await cleanupLetterImages(images);
  throw httpError(`Mỗi lời chúc kèm tối đa ${max} ảnh`, 400);
}

module.exports = {
  LETTER_MAX_IMAGES,
  letterImageUpload,
  normalizeMultipartLetterBody,
  extractLetterImages,
  cleanupLetterImages,
  assertImageCount,
};
