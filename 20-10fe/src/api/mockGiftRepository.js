import { mockStudents, mockGallery, mockLetters } from '../Data/mockData'

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const normalizeName = (name) =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')

async function resolveStudent(name) {
  await delay(600)
  const normalized = normalizeName(name)

  if (normalized.length < 2) {
    return null
  }

  const student = mockStudents.find((item) => {
    const fullName = normalizeName(item.full_name)
    const nickname = normalizeName(item.nickname || '')
    return fullName.includes(normalized) || nickname.includes(normalized)
  })

  if (student) {
    return { giftPath: `/gift/${student.access_code}` }
  }

  if (normalized.length <= 3) {
    return {
      matches: mockStudents.map((item) => ({
        displayName: item.full_name,
        nickname: item.nickname,
        avatarUrl: item.avatar_url,
        giftPath: `/gift/${item.access_code}`,
      })),
      message: 'Có nhiều bạn trùng tên. Chọn bạn cần tìm?',
    }
  }

  return null
}

async function getGift(accessCode) {
  await delay(400)
  return mockStudents.find((student) => student.access_code === accessCode) || null
}

async function getGallery(accessCode) {
  await delay(500)
  if (accessCode === 'vy1020' || accessCode === 'anh2010') {
    return mockGallery
  }
  return []
}

async function getLetters(accessCode) {
  await delay(500)
  if (accessCode === 'vy1020' || accessCode === 'anh2010') {
    return mockLetters
  }
  return []
}

async function createLetter(accessCode, data) {
  await delay(300)

  if (data._website) {
    return { status: 'pending' }
  }

  if (!data.content || !data.content.trim()) {
    throw new Error('Nội dung không được để trống')
  }

  if (data.content.trim().length > 5000) {
    throw new Error('Nội dung quá dài (tối đa 5000 ký tự)')
  }
  if (data.title && data.title.trim().length > 200) {
    throw new Error('Tiêu đề quá dài (tối đa 200 ký tự)')
  }
  if (data.sender_name && data.sender_name.trim().length > 100) {
    throw new Error('Tên người gửi quá dài (tối đa 100 ký tự)')
  }

  return { status: 'pending' }
}

async function generateGreeting(name, audienceType = 'student') {
  await delay(300)
  if (audienceType === 'visitor') {
    return { greeting: `Dù chúng mình có thể chưa từng học cùng nhau, ${name} vẫn là một bông hoa nhỏ xứng đáng nhận được những lời chúc tốt đẹp. Chúc bạn có một ngày 20/10 thật vui vẻ, luôn rạng rỡ và gặp nhiều may mắn! 🌷` }
  }
  return { greeting: `Chúc ${name} một ngày 20/10 thật vui vẻ và rạng rỡ! 🌷` }
}

const mockGiftRepository = {
  resolveStudent,
  getGift,
  getGallery,
  getLetters,
  createLetter,
  generateGreeting,
}

export default mockGiftRepository
