// Thông tin sự kiện dùng chung cho header, footer, dấu bưu điện và đếm ngược
export const CLASS_NAME = '12A1'
export const EVENT_YEAR = new Date().getFullYear()
export const EVENT_LABEL = `20.10.${EVENT_YEAR}`
// "Bưu điện 12A1" — khớp dấu bưu điện và tên khu admin, không phải "Lớp 12A1"
export const CLASS_LABEL = `Bưu điện ${CLASS_NAME} · ${EVENT_LABEL}`

// 00:00 ngày 20/10 gần nhất còn ở phía trước (giờ máy người xem)
export function nextEventDate(now = new Date()) {
  const target = new Date(now.getFullYear(), 9, 20, 0, 0, 0, 0)
  return target > now ? target : new Date(now.getFullYear() + 1, 9, 20, 0, 0, 0, 0)
}

// Chuỗi kiểu "18.10.2026 · 21:30" cho chân thư và bưu thiếp
export function formatStamp(value, { time = true } = {}) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  const day = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
  return time ? `${day} · ${pad(date.getHours())}:${pad(date.getMinutes())}` : day
}
