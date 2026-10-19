import api from '../services/api'
import { giftAuthHeaders } from '../lib/giftTickets'

// scope: 'class' (thành viên lớp) | 'friend' (hồ sơ bạn bè ngoài lớp)
async function resolveStudent(name, scope = 'class') {
  const response = await api.post('/api/students/resolve', { name, scope })
  return response.data.data
}

// Kèm ảnh (tối đa 4) → gửi multipart; không ảnh → JSON như cũ
function toLetterPayload(data, imageFiles) {
  const files = [imageFiles].flat().filter(Boolean)
  if (!files.length) return data
  const form = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) form.append(key, value)
  })
  files.forEach((file) => form.append('images', file))
  return form
}

async function getGift(accessCode) {
  const response = await api.get(`/api/gifts/${encodeURIComponent(accessCode)}`)
  return response.data.data
}

async function getGiftContent(accessCode) {
  const response = await api.get(`/api/gifts/${encodeURIComponent(accessCode)}/content`)
  return response.data.data
}

async function getGallery(accessCode) {
  const response = await api.get(`/api/gifts/${encodeURIComponent(accessCode)}/gallery`)
  return response.data.data
}

async function getLetters(accessCode) {
  const response = await api.get(`/api/gifts/${encodeURIComponent(accessCode)}/letters`)
  return response.data.data
}

async function createLetter(accessCode, data, imageFiles = []) {
  const response = await api.post(
    `/api/gifts/${encodeURIComponent(accessCode)}/letters`,
    toLetterPayload(data, imageFiles),
  )
  return response.data.data
}

// Gửi lời chúc cho một khách NGOÀI lớp đã có trong danh sách (admin thêm)
async function createFriendLetter(data, imageFiles = []) {
  const response = await api.post('/api/friends/letters', toLetterPayload(data, imageFiles))
  return response.data.data
}

// Ô "Ngoài lớp": tra một khách đã có theo tên → { matches: [{ id, name, nickname }], unsure }
// Không có ai tên đó thì lỗi 404 (người gửi nhập lại tên)
async function findWishGuest(name) {
  const response = await api.post('/api/wishes/guest', { name })
  return response.data.data
}

// Các bạn trong lớp và cô giáo để tích chọn khi gửi lời chúc: [{ id, name, nickname }]
async function listWishRecipients() {
  const response = await api.get('/api/wishes/recipients')
  return response.data.data
}

// Một lời chúc gửi cho nhiều bạn cùng lúc. recipients: [{ id } | { code } | { friend }];
// ảnh tải lên một lần, dùng chung cho mọi người nhận
async function createWishes(recipients, data, imageFiles = []) {
  const files = [imageFiles].flat().filter(Boolean)
  const payload = files.length
    ? toLetterPayload({ ...data, recipients: JSON.stringify(recipients) }, files)
    : { ...data, recipients }
  const response = await api.post('/api/wishes', payload)
  return response.data.data
}

async function generateGreeting(name, audienceType = 'student') {
  const response = await api.post('/api/greetings/generate', { name, audienceType })
  return response.data.data
}

// ── Face ID ("Mắt thần 20/10") ───────────────────────────────────────────────
// { enabled, model, profiles } — enabled=false khi admin tắt, service chưa
// lên hoặc chưa có hồ sơ; FE chỉ hiện thẻ ✨ khi enabled
// scope 'friend': nhóm khách ngoài lớp (thư viện khuôn mặt riêng); bỏ trống là lớp
async function faceStatus(scope) {
  const response = await api.get('/api/face/status', scope === 'friend' ? { params: { scope } } : undefined)
  return response.data.data
}

// Một khung hình camera (Blob JPEG ≤ 480 px) → quyết định của server.
// signal để hủy khi đóng modal. timeout phải dài hơn lúc backend chờ
// face-service (8 giây, khi cả lớp quét cùng lúc khung phải xếp hàng) — hết
// giờ ở trình duyệt trước thì lượt quét dừng oan với câu "Face ID nghỉ".
// scan/t (mã lượt quét, ms từ lúc camera chạy) để admin xem lại lượt đó.
// scope 'friend' khi khách quét: chỉ so với thư viện khách.
async function matchFace(blob, { signal, timeout = 10000, scan, t, scope, challenge } = {}) {
  const form = new FormData()
  form.append('frame', blob, 'frame.jpg')
  if (scan) form.append('scan', scan)
  // Mã lệnh quay đầu máy chủ vừa ra (chống giơ ảnh)
  if (challenge) form.append('challenge', challenge)
  if (Number.isFinite(t)) form.append('t', String(Math.round(t)))
  if (scope === 'friend') form.append('scope', scope)
  const response = await api.post('/api/face/match', form, { signal, timeout })
  return response.data.data
}

// Lượt quét kết thúc thế nào: { outcome, matchId?, durationMs, darkFrames }.
// Có thể được gửi đúng lúc trang đang đóng, nên dùng fetch keepalive (sống
// tiếp sau khi trang đã đi) thay vì axios — XHR bị hủy cùng trang.
async function faceScanEnd(token, data) {
  const response = await fetch(`${api.defaults.baseURL}/api/face/scans/${token}/end`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw Object.assign(new Error(`Không gửi được kết quả quét (${response.status})`), { status: response.status })
  return (await response.json()).data
}

// Gõ tên mở quà ngay sau các lượt quét chưa thành: ghép tên vào các lượt đó
async function faceScanClaim(tokens, accessCode) {
  const response = await api.post('/api/face/scans/claim', { tokens, accessCode })
  return response.data.data
}

// ── Ngày 20/10: đếm ngược, bông hoa 12A1, hồi âm, bản lưu ───────────────────
// { locked, unlockAt, serverNow, opened?, total?, replies? }
async function getEventStatus() {
  const response = await api.get('/api/event')
  return response.data.data
}

// Mở quà từ trang chủ (gõ tên / Face ID) → { counted, rank, opened, total }
async function recordOpen(accessCode, via = 'name') {
  const response = await api.post(`/api/gifts/${encodeURIComponent(accessCode)}/open`, { via })
  return response.data.data
}

// { target: 'letter' | 'class' | 'admin', letter_id?, content } → hồi âm chờ duyệt
async function createReply(accessCode, data) {
  const response = await api.post(`/api/gifts/${encodeURIComponent(accessCode)}/replies`, data)
  return response.data.data
}

// Hộp thư hồi âm công khai; `to` lọc những hồi âm gửi đích danh một người.
// exact: khớp trọn chữ ("An" không tính hồi âm gửi "Anh") — dùng khi báo
// "có thư gửi cậu"; ô tìm kiếm thì khớp từ đầu chữ, gõ tới đâu lọc tới đó
async function listReplies({ to, exact = false } = {}) {
  const params = {}
  if (to) params.to = to
  if (to && exact) params.exact = 1
  const response = await api.get('/api/replies', { params })
  return response.data.data
}

// Bản lưu quà: máy chủ kéo ảnh về nhúng vào file nên có thể mất vài chục giây.
// Dùng fetch thay axios để đọc được thông báo lỗi JSON khi phản hồi không phải file.
async function downloadKeepsake(accessCode, greeting = '') {
  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(90_000) : undefined
  let response
  try {
    response = await fetch(`${api.defaults.baseURL}/api/gifts/${encodeURIComponent(accessCode)}/keepsake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...giftAuthHeaders(accessCode) },
      body: JSON.stringify({ greeting: greeting || undefined, format: 'pdf' }),
      signal: timeout,
    })
  } catch (error) {
    throw Object.assign(new Error(error?.name === 'TimeoutError'
      ? 'Gói quà lâu quá, thử lại giúp mình nhé.'
      : 'Không thể kết nối tới máy chủ'), { isNetworkError: true })
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw Object.assign(
      new Error(payload?.message || `Không tải được bản lưu (${response.status})`),
      { status: response.status },
    )
  }
  return response.blob()
}

export default {
  resolveStudent, getGift, getGiftContent, getGallery, getLetters,
  createLetter, createFriendLetter, createWishes, findWishGuest, listWishRecipients, generateGreeting,
  faceStatus, matchFace, faceScanEnd, faceScanClaim,
  getEventStatus, recordOpen, createReply, listReplies, downloadKeepsake,
}
