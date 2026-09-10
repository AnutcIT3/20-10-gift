const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// heic/heif là mặc định của iPhone; Cloudinary nhận được và f_auto lúc hiển thị
// sẽ chuyển sang định dạng trình duyệt đọc được
const ALLOWED_IMAGE_TYPES = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heic', 'heif'];

module.exports = { MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES };
