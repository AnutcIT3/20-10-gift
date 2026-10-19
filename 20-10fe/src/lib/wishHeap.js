// Đống thư trên trang chủ: mỗi lời chúc là một lá thư nằm lung tung như đống
// lá. Vị trí lá thứ i là giả ngẫu nhiên theo i — lá đã nằm thì không bao giờ
// xê dịch, lá mới chỉ rơi thêm lên mặt đống.

// Trần số lá vẽ ra: quá 200 thì đống không to thêm (số đếm vẫn tăng)
export const HEAP_CAP = 200
// Nhiều lời chúc tới cùng lúc: chỉ cho bay chừng này lá, phần dư đặt thẳng vào đống
export const MAX_FLIGHTS = 5
export const FLIGHT_MS = 2600
export const FLIGHT_GAP_MS = 650

const COLORS = ['#fffdf8', '#fbf6ee', '#f3e6d4', '#fbe9db', '#efe3d2', '#f6dcc8', '#f3c9ad']
const STAMPS = ['#a85f3f', '#6f8560', '#c97a5a', '#d9a07f']

function rand(i, k) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

// Lá thứ i rơi lên mặt một ụ có bề rộng và độ cao lớn dần theo căn bậc hai
// của i (nhiều lá thì ụ to, nhưng chậm dần). x tính từ giữa đống, y từ đáy.
export function heapSpot(i) {
  const halfW = 34 + 8.6 * Math.sqrt(i)
  const height = 8 + 6.4 * Math.sqrt(i)
  const u = rand(i, 1) * 2 - 1
  const surface = height * (1 - u * u)
  return {
    x: u * halfW * 0.96,
    y: 14 + Math.max(0, surface - rand(i, 2) * 9),
    // Vài lá nằm gần như dọc, còn lại nghiêng vừa
    r: (rand(i, 3) * 2 - 1) * (rand(i, 4) < 0.2 ? 85 : 42),
    s: 0.82 + rand(i, 5) * 0.3,
    color: COLORS[Math.floor(rand(i, 6) * COLORS.length)],
    face: rand(i, 7) < 0.45 ? 'back' : rand(i, 8) < 0.7 ? 'front' : 'heart',
    stamp: STAMPS[Math.floor(rand(i, 9) * STAMPS.length)],
  }
}

export function heapShadowWidth(count) {
  return 2 * (40 + 8.6 * Math.sqrt(Math.min(count, HEAP_CAP)))
}

// Đường bay như chiếc lá: lắc qua lắc lại, xoay dần, đáp đúng chỗ của lá
export function leafFrames(spot, drop, drift) {
  const frames = []
  for (let k = 0; k <= 16; k += 1) {
    const t = k / 16
    const ease = t * t * (3 - 2 * t)
    const sway = Math.sin(t * Math.PI * 3.5) * 55 * (1 - t)
    const x = spot.x + drift * (1 - ease) + sway
    const y = spot.y + drop * (1 - t) ** 1.15
    const r = spot.r * ease + Math.sin(t * Math.PI * 3.5 + 0.8) * 50 * (1 - t)
    frames.push({ transform: `translate(${x}px, ${-y}px) rotate(${r}deg) scale(${spot.s})`, offset: t })
  }
  return frames
}

// "2 phút trước" cho dòng "Ai đó vừa gửi một lời chúc"; quá 24 giờ thì thôi không hiện
export function sentAgo(lastAt, now) {
  if (!lastAt) return null
  const minutes = Math.floor((now - new Date(lastAt).getTime()) / 60000)
  if (!Number.isFinite(minutes) || minutes >= 24 * 60) return null
  if (minutes < 1) return 'vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  return `${Math.floor(minutes / 60)} giờ trước`
}
