// Thông tin sự kiện dùng chung cho header, footer, dấu bưu điện và đếm ngược
export const CLASS_NAME = '12A1'
export const EVENT_YEAR = new Date().getFullYear()
export const EVENT_LABEL = `20.10.${EVENT_YEAR}`
// "Lớp 12A1" — nhãn lớp dùng chung cho header/footer trang quà (không dùng "Bưu điện")
export const CLASS_LABEL = `Lớp ${CLASS_NAME} · ${EVENT_LABEL}`

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

export const pad2 = (n) => String(n).padStart(2, '0')

// Tách khoảng thời gian (ms) thành ngày/giờ/phút/giây cho đồng hồ đếm ngược
export function splitDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  }
}

// "00:00 · 20/10" — giờ quà tự mở, theo giờ máy người xem
export function formatClock(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())} · ${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`
}

// Độ lệch đồng hồ máy người xem so với máy chủ (ms): lấy giữa lúc gửi và lúc
// nhận để bù độ trễ mạng. Đồng hồ điện thoại chạy nhanh vài phút cũng không làm
// quà "mở" sớm trên màn hình.
export function serverOffset(serverNow, sentAt, receivedAt = sentAt) {
  const server = new Date(serverNow).getTime()
  if (!Number.isFinite(server)) return 0
  return server - (sentAt + receivedAt) / 2
}
