import { mockStudents, mockGallery, mockLetters } from '../Data/mock'

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
      message: 'Co nhieu ban trung ten. Chon ban can tim?',
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
    throw new Error('Noi dung khong duoc de trong')
  }

  if (data.content.trim().length > 5000) {
    throw new Error('Noi dung qua dai (toi da 5000 ky tu)')
  }
  if (data.title && data.title.trim().length > 200) {
    throw new Error('Tieu de qua dai (toi da 200 ky tu)')
  }
  if (data.sender_name && data.sender_name.trim().length > 100) {
    throw new Error('Ten nguoi gui qua dai (toi da 100 ky tu)')
  }

  return { status: 'pending' }
}

async function generateGreeting(name, audienceType = 'student') {
  await delay(300)
  if (audienceType === 'visitor') {
    return { greeting: `Chuc ${name} co mot ngay 20/10 that vui ve, luon rang ro va gap nhieu may man!` }
  }
  return { greeting: `Chuc ${name} mot ngay 20/10 that vui ve va rang ro!` }
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
