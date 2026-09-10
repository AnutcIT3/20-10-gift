// Ảnh tải lên được lưu nguyên bản trên Cloudinary (tới 5 MB/tấm), trong khi
// polaroid trên trang quà chỉ rộng ~250 px. Chèn tham số biến đổi vào URL để
// Cloudinary trả bản đã thu nhỏ và nén đúng định dạng trình duyệt hỗ trợ.
// URL không phải của Cloudinary (blob:, ảnh ngoài) được trả về nguyên vẹn.

const UPLOAD_MARKER = '/image/upload/'

export const CLD_THUMB = 'f_auto,q_auto,c_limit,w_600'
// Ảnh đại diện là polaroid vuông: cắt vuông, ưu tiên giữ khuôn mặt ở giữa
export const CLD_AVATAR = 'f_auto,q_auto,c_fill,g_face,w_600,h_600'
export const CLD_FULL = 'f_auto,q_auto,c_limit,w_1400'
// Thẻ nhỏ trong admin (danh sách học sinh, dấu avatar)
export const CLD_TINY = 'f_auto,q_auto,c_fill,g_face,w_160,h_160'

export function cld(url, transform = CLD_THUMB) {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url
  const at = url.indexOf(UPLOAD_MARKER)
  if (at === -1) return url
  const rest = url.slice(at + UPLOAD_MARKER.length)
  // Đã có đoạn biến đổi (không bắt đầu bằng phiên bản v123/ hay thư mục) thì để yên
  if (!/^(v\d+\/|gift_20_10\/)/.test(rest)) return url
  return `${url.slice(0, at + UPLOAD_MARKER.length)}${transform}/${rest}`
}
