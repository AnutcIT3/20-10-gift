// Phần "không cần DOM" của trang Lịch sử Face ID: nhãn, định dạng, gộp trang.
// Backend đã chẩn đoán sẵn nguyên nhân (issue) cho từng lượt; ở đây chỉ đổi
// thành chữ và gợi ý việc nên làm.

// Lượt chưa có tín hiệu kết thúc: trong khoảng này coi là đang quét, quá thì bỏ dở
export const LIVE_MS = 60 * 1000
// Điểm cao nhất cách ngưỡng chưa tới mức này thì gọi là "suýt khớp"
export const NEAR_MISS_GAP = 0.1

export const OUTCOMES = Object.freeze({
  confirmed: { label: 'Nhận đúng', tone: 'ok' },
  denied: { label: 'Nhầm người', tone: 'bad' },
  unrecognized: { label: 'Không nhận ra', tone: 'warn' },
  timeout: { label: 'Hết giờ', tone: 'warn' },
  camera: { label: 'Lỗi camera', tone: 'bad' },
  offline: { label: 'Face ID nghỉ', tone: 'bad' },
  network: { label: 'Mạng chập chờn', tone: 'warn' },
  limited: { label: 'Quá nhiều lượt', tone: 'bad' },
  hidden: { label: 'Rời tab', tone: 'muted' },
  closed: { label: 'Tự đóng', tone: 'muted' },
})

export const ISSUES = Object.freeze({
  wrong_person: {
    label: 'Máy nhận nhầm sang người khác',
    tip: 'Xem lại ảnh hồ sơ của cả hai bạn. Nếu cứ nhầm đúng cặp này, thêm ảnh rõ mặt cho cả hai rồi chạy lại face:enroll.',
  },
  no_match: {
    label: 'Nhìn rõ mặt nhưng không khớp ai',
    tip: 'Ảnh hồ sơ có thể đã cũ hoặc khác góc (kính, tóc mới…). Thêm vài ảnh gần đây của bạn ấy rồi chạy lại face:enroll.',
  },
  dark: {
    label: 'Quá tối',
    tip: 'Nhắc quét ở chỗ sáng, đèn chiếu vào mặt chứ không phải sau lưng.',
  },
  small: {
    label: 'Đứng xa, mặt quá nhỏ',
    tip: 'Nhắc cầm máy gần hơn: mặt chiếm khoảng nửa khung là vừa.',
  },
  blurry: {
    label: 'Rung hoặc nhòe',
    tip: 'Nhắc giữ máy yên một nhịp, lau camera trước.',
  },
  no_face: {
    label: 'Không thấy mặt trong khung',
    tip: 'Có thể đang cầm máy lệch, quay nghiêng quá, hoặc đang dùng camera sau.',
  },
  many_faces: {
    label: 'Nhiều người trong khung',
    tip: 'Chỉ một người trong khung khi quét.',
  },
  unanswered: {
    label: 'Máy đã hỏi, chưa ai trả lời',
    tip: 'Người dùng đóng trang ở câu "Có phải cậu là…?". Xem tên máy đã đoán ở dưới.',
  },
  camera: {
    label: 'Không mở được camera',
    tip: 'Thường do mở link trong Zalo/Messenger/Facebook hoặc bấm từ chối quyền camera — mở bằng Safari hay Chrome.',
  },
  offline: {
    label: 'Face ID nghỉ',
    tip: 'Máy chủ báo Face ID đang tắt hoặc face-service không trả lời — kiểm tra công tắc Face ID và cửa sổ public mode.',
  },
  network: {
    label: 'Mạng của người quét chập chờn',
    tip: 'Khung hình không tới được máy chủ (mạng điện thoại yếu, đang đổi Wi-Fi/4G, trình duyệt trong Facebook/Zalo). Thường quét lại là được; lặp lại nhiều thì mở link bằng Chrome/Safari hoặc đổi mạng.',
  },
  limited: {
    label: 'Chạm giới hạn số lượt quét',
    tip: 'Hạn mức giờ rất cao (10000 khung/15 phút mỗi IP), dùng thật không chạm tới — gặp là có máy bị kẹt vòng lặp gửi liên tục.',
  },
  no_frames: {
    label: 'Camera mở nhưng không có hình',
    tip: 'Camera bị app khác giữ hoặc trình duyệt chưa cho phát video.',
  },
  left_early: {
    label: 'Đóng trước khi máy kịp nhận',
    tip: 'Không có vấn đề gì về hình — người dùng tự đóng hoặc chuyển tab.',
  },
})

// Mỗi khung hình: decision (low_quality thì lấy reason) → nhãn + màu trên dải khung
export const FRAME_KINDS = Object.freeze({
  match: { label: 'Khớp', tone: 'ok' },
  reject: { label: 'Không khớp', tone: 'bad' },
  dark: { label: 'Tối', tone: 'warn' },
  small: { label: 'Mặt nhỏ', tone: 'warn' },
  blurry: { label: 'Nhòe', tone: 'warn' },
  no_face: { label: 'Không thấy mặt', tone: 'muted' },
  many_faces: { label: 'Nhiều người', tone: 'muted' },
})

const DEVICES = {
  iphone: 'iPhone',
  ipad: 'iPad',
  android: 'Android',
  android_tab: 'Máy tính bảng Android',
  windows: 'Windows',
  mac: 'Mac',
  linux: 'Linux',
  other: 'Máy khác',
}

const BROWSERS = {
  zalo: 'Zalo',
  messenger: 'Messenger',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  coccoc: 'Cốc Cốc',
  samsung: 'Samsung Internet',
  edge: 'Edge',
  opera: 'Opera',
  firefox: 'Firefox',
  chrome: 'Chrome',
  safari: 'Safari',
  other: 'trình duyệt khác',
}

export function outcomeOf(scan, now = Date.now()) {
  if (scan.outcome) return OUTCOMES[scan.outcome] || { label: scan.outcome, tone: 'muted' }
  const age = now - new Date(scan.startedAt).getTime()
  return age < LIVE_MS ? { label: 'Đang quét…', tone: 'live' } : { label: 'Bỏ dở', tone: 'muted' }
}

export function frameKind(frame) {
  return frame.decision === 'low_quality' ? frame.reason : frame.decision
}

export function deviceLabel(scan) {
  const parts = [DEVICES[scan.device], BROWSERS[scan.browser]].filter(Boolean)
  return parts.join(' · ')
}

// Số thập phân kiểu Việt: 0,45 — 1,7 giây
function decimal(value, digits) {
  return value.toFixed(digits).replace('.', ',')
}

export function formatScore(score) {
  return Number.isFinite(score) ? decimal(score, 2) : '—'
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—'
  return ms < 10_000 ? `${decimal(ms / 1000, 1)} giây` : `${Math.round(ms / 1000)} giây`
}

export function formatSeconds(ms) {
  return Number.isFinite(ms) ? `${decimal(ms / 1000, 1)}s` : '—'
}

export function formatWhen(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} · ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

// Người máy thấy giống nhất nhưng điểm chỉ thiếu chút nữa là tới ngưỡng
export function isNearMiss(best, tau) {
  return Boolean(best) && Number.isFinite(best.score) && best.score < tau && best.score >= tau - NEAR_MISS_GAP
}

// Tự làm mới: trang mới nhất thay chỗ các lượt trùng, còn các lượt cũ hơn đã
// tải bằng "Xem thêm" được giữ lại — admin không mất chỗ đang đọc
export function mergeScans(fresh, existing) {
  const ids = new Set(fresh.map((scan) => scan.id))
  const oldest = fresh.length ? fresh[fresh.length - 1].id : Infinity
  return [...fresh, ...existing.filter((scan) => !ids.has(scan.id) && scan.id < oldest)]
}

// Thành viên cần để ý lên đầu: chưa có hồ sơ, hay phải gõ tên, hay bị nhận nhầm
export function memberNeedsAttention(member) {
  return !member.hasProfile || member.failed > 0 || member.mistakenFor > 0
}

export function sortMembers(members) {
  return [...members].sort((a, b) => (
    Number(memberNeedsAttention(b)) - Number(memberNeedsAttention(a))
    || b.failed - a.failed
    || b.mistakenFor - a.mistakenFor
    || Number(a.hasProfile) - Number(b.hasProfile)
    || a.name.localeCompare(b.name, 'vi')
  ))
}
