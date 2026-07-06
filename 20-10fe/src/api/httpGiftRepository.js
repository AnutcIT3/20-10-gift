import api from '../services/api'

async function resolveStudent(name) {
  const response = await api.post('/api/students/resolve', { name })
  return response.data.data
}

async function getGift(accessCode) {
  const response = await api.get(`/api/gifts/${encodeURIComponent(accessCode)}`)
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

async function createLetter(accessCode, data) {
  const response = await api.post(`/api/gifts/${encodeURIComponent(accessCode)}/letters`, data)
  return response.data.data
}

async function generateGreeting(name, audienceType = 'student') {
  const response = await api.post('/api/greetings/generate', { name, audienceType })
  return response.data.data
}

export default { resolveStudent, getGift, getGallery, getLetters, createLetter, generateGreeting }
