const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// heic/heif là mặc định của iPhone; Cloudinary nhận được và f_auto lúc hiển thị
// sẽ chuyển sang định dạng trình duyệt đọc được
const ALLOWED_IMAGE_TYPES = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heic', 'heif'];

// ── Face ID ──────────────────────────────────────────────────────────────
// face-service Python chạy nội bộ trên cùng máy; không chạy thì thẻ tự ẩn
const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || 'http://127.0.0.1:5002';
// Model đã chọn ở face-service/RESULTS.md — hồ sơ chỉ so được với vector của
// đúng model này, nên tên model đi kèm mọi hàng face_profiles
const FACE_MODEL = 'arcface_r50';
// Ngưỡng cosine và cách biệt top1 − top2 đo được trong RESULTS.md; cho phép
// đổi bằng env để đo lại mà không sửa mã
const FACE_TAU = Number(process.env.FACE_TAU ?? 0.45);
const FACE_MARGIN = Number(process.env.FACE_MARGIN ?? 0.10);
// Cổng chất lượng khung hình: mặt nhỏ hơn, tối hơn hay nhòe hơn mức này thì
// không chấm điểm mà nhắc người dùng chỉnh lại
const FACE_MIN_FACE_PX = 80;
const FACE_MIN_BRIGHTNESS = 40;
const FACE_MIN_BLUR = 40;
// Khung hình quét đã thu nhỏ ≤ 480 px nên 1 MB là dư; chặn sớm ở multer
const FACE_FRAME_MAX_BYTES = 1024 * 1024;
// face-service xử lý lần lượt từng khung (~90 ms/khung, ~11 khung/giây), nên khi
// cả lớp quét cùng lúc khung phải xếp hàng: mỗi người quét góp một khung vào
// hàng. Thử tải: 40 người cùng lúc thì chờ tới ~4,1 giây — mức cũ 4 giây làm gần
// nửa số bạn bị báo "Face ID nghỉ". 8 giây đủ cho ~80 người quét cùng một lúc;
// service chết thật thì /health (đệm 10 giây) vẫn báo nghỉ ngay, không phải chờ.
const FACE_EMBED_TIMEOUT_MS = 8000;
// Bộ nhớ đệm: /health và thư viện vector đọc lại theo chu kỳ, không mỗi khung
const FACE_HEALTH_TTL_MS = 10000;
const FACE_GALLERY_TTL_MS = 30000;

module.exports = {
  MAX_IMAGE_SIZE,
  ALLOWED_IMAGE_TYPES,
  FACE_SERVICE_URL,
  FACE_MODEL,
  FACE_TAU,
  FACE_MARGIN,
  FACE_MIN_FACE_PX,
  FACE_MIN_BRIGHTNESS,
  FACE_MIN_BLUR,
  FACE_FRAME_MAX_BYTES,
  FACE_EMBED_TIMEOUT_MS,
  FACE_HEALTH_TTL_MS,
  FACE_GALLERY_TTL_MS,
};
