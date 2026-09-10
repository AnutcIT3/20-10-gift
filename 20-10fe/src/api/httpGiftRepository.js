import api from '../services/api'

// scope: 'class' (thành viên lớp) | 'friend' (hồ sơ bạn bè ngoài lớp)
async function resolveStudent(name, scope = 'class') {
  const response = await api.post('/api/students/resolve', { name, scope })
  return response.data.data
}

// Kèm ảnh → gửi multipart; không ảnh → JSON như cũ
function toLetterPayload(data, imageFile) {
  if (!imageFile) return data
  const form = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) form.append(key, value)
  })
  form.append('image', imageFile)
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

async function createLetter(accessCode, data, imageFile = null) {
  const response = await api.post(
    `/api/gifts/${encodeURIComponent(accessCode)}/letters`,
    toLetterPayload(data, imageFile),
  )
  return response.data.data
}

// Gửi lời chúc cho người NGOÀI lớp — backend tự tạo hồ sơ "bạn bè"
async function createFriendLetter(data, imageFile = null) {
  const response = await api.post('/api/friends/letters', toLetterPayload(data, imageFile))
  return response.data.data
}

async function generateGreeting(name, audienceType = 'student') {
  const response = await api.post('/api/greetings/generate', { name, audienceType })
  return response.data.data
}

// ── Face ID ("Mắt thần 20/10") ───────────────────────────────────────────────
// { enabled, model, profiles } — enabled=false khi admin tắt, service chưa
// lên hoặc chưa có hồ sơ; FE chỉ hiện thẻ ✨ khi enabled
async function faceStatus() {
  const response = await api.get('/api/face/status')
  return response.data.data
}

// Một khung hình camera (Blob JPEG ≤ 480 px) → quyết định của server.
// signal để hủy khi đóng modal. timeout phải dài hơn lúc backend chờ
// face-service (8 giây, khi cả lớp quét cùng lúc khung phải xếp hàng) — hết
// giờ ở trình duyệt trước thì lượt quét dừng oan với câu "Face ID nghỉ".
// scan/t (mã lượt quét, ms từ lúc camera chạy) để admin xem lại lượt đó.
async function matchFace(blob, { signal, timeout = 10000, scan, t } = {}) {
  const form = new FormData()
  form.append('frame', blob, 'frame.jpg')
  if (scan) form.append('scan', scan)
  if (Number.isFinite(t)) form.append('t', String(Math.round(t)))
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

export default {
  resolveStudent, getGift, getGiftContent, getGallery, getLetters,
  createLetter, createFriendLetter, generateGreeting,
  faceStatus, matchFace, faceScanEnd, faceScanClaim,
}
