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
// signal để hủy khi đóng modal; timeout ngắn hơn mặc định vì vòng quét gửi
// liên tục, một khung treo không được chặn các khung sau
async function matchFace(blob, { signal, timeout = 6000 } = {}) {
  const form = new FormData()
  form.append('frame', blob, 'frame.jpg')
  const response = await api.post('/api/face/match', form, { signal, timeout })
  return response.data.data
}

// Người dùng trả lời "đúng là mình" / "không phải" — chỉ gửi số, không ảnh
async function faceConfirm(matchId, confirmed) {
  const response = await api.post('/api/face/confirm', { matchId, confirmed })
  return response.data.data
}

export default {
  resolveStudent, getGift, getGiftContent, getGallery, getLetters,
  createLetter, createFriendLetter, generateGreeting,
  faceStatus, matchFace, faceConfirm,
}
