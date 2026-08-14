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

export default {
  resolveStudent, getGift, getGiftContent, getGallery, getLetters,
  createLetter, createFriendLetter, generateGreeting,
}
