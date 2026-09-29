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

async function resolveStudent(name, scope = 'class') {
  // Mock không có hồ sơ bạn bè: luồng khách (scope friend) không được phép
  // khớp vào thành viên lớp — trả null để FE chuyển sang trang celebrate
  if (scope === 'friend') {
    await delay(200)
    return null
  }
  return resolveClassStudent(name)
}

async function resolveClassStudent(name) {
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

async function getGiftContent(accessCode) {
  const [student, gallery, letters] = await Promise.all([
    getGift(accessCode),
    getGallery(accessCode),
    getLetters(accessCode),
  ])
  return { student, gallery, letters, replies: [] }
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

async function createFriendLetter(data) {
  await delay(400)
  if (data._website) return { status: 'pending' }
  const receiverName = (data.receiver_name || '').trim()
  if (receiverName.length < 2) throw Object.assign(new Error('Tên người nhận phải có ít nhất 2 ký tự'), { status: 400 })
  return { status: 'pending', friend_created: true }
}

async function generateGreeting(name, audienceType = 'student') {
  await delay(300)
  if (audienceType === 'visitor') {
    return { greeting: `Dù chúng mình có thể chưa từng học cùng nhau, ${name} vẫn là một bông hoa nhỏ xứng đáng nhận được những lời chúc tốt đẹp. Chúc bạn có một ngày 20/10 thật vui vẻ, luôn rạng rỡ và gặp nhiều may mắn! 🌷` }
  }
  if (audienceType === 'classmate') {
    return { greeting: `Cảm ơn ${name} đã là một phần của tập thể lớp mình! Chúc cậu một ngày 20/10 thật vui bên cả lớp nhé! 🌷` }
  }
  return { greeting: `Chúc ${name} một ngày 20/10 thật vui vẻ và rạng rỡ! 🌷` }
}

// ── Face ID: chế độ mock luôn "tắt tính năng" để thẻ ✨ tự ẩn ─────────────────
async function faceStatus() {
  await delay(100)
  return { enabled: false, model: null, profiles: 0 }
}

async function matchFace() {
  await delay(100)
  throw Object.assign(new Error('Face ID tạm nghỉ'), { status: 503 })
}

async function faceScanEnd() {
  await delay(100)
  return { ok: true }
}

async function faceScanClaim() {
  await delay(100)
  return { ok: true }
}

// ── Ngày 20/10 ──────────────────────────────────────────────────────────────
async function getEventStatus() {
  await delay(100)
  return { locked: false, unlockAt: null, serverNow: new Date().toISOString(), opened: 5, total: 23, replies: 2 }
}

async function recordOpen() {
  await delay(100)
  return { counted: true, rank: 6, opened: 6, total: 23 }
}

async function createReply(accessCode, data) {
  await delay(300)
  const content = (data.content || '').trim()
  if (!content) throw Object.assign(new Error('Nội dung không được để trống'), { status: 400 })
  return {
    id: Date.now(),
    target: data.target,
    letter_id: data.target === 'letter' ? data.letter_id : null,
    content,
    status: 'pending',
    created_at: new Date().toISOString(),
  }
}

async function listReplies({ to, exact = false } = {}) {
  await delay(300)
  const items = [
    {
      id: 2,
      content: 'Cảm ơn Nam nhiều nha, đọc xong cười cả buổi 😄',
      created_at: '2026-10-20T01:00:00Z',
      from: { name: 'Vy', fullName: 'Nguyễn Thúy Vy', friend: false },
      to: { kind: 'person', name: 'Hoàng Nam' },
    },
    {
      id: 1,
      content: 'Cảm ơn cả lớp đã làm món quà dễ thương thế này 🌷',
      created_at: '2026-10-20T00:10:00Z',
      from: { name: 'Anh', fullName: 'Trần Mai Anh', friend: false },
      to: { kind: 'class' },
    },
  ]
  const matches = (name) => {
    const words = ` ${normalizeName(name)} `
    return words.includes(exact ? ` ${normalizeName(to)} ` : ` ${normalizeName(to)}`)
  }
  const filtered = to ? items.filter((item) => item.to.kind === 'person' && matches(item.to.name)) : items
  return { items: filtered, total: filtered.length }
}

async function downloadKeepsake(accessCode) {
  await delay(500)
  return new Blob([`<!doctype html><title>Quà 20/10</title><p>Bản lưu mẫu của ${accessCode}</p>`], { type: 'text/html' })
}

const mockGiftRepository = {
  resolveStudent,
  getGift,
  getGiftContent,
  getGallery,
  getLetters,
  createLetter,
  createFriendLetter,
  generateGreeting,
  faceStatus,
  matchFace,
  faceScanEnd,
  faceScanClaim,
  getEventStatus,
  recordOpen,
  createReply,
  listReplies,
  downloadKeepsake,
}

export default mockGiftRepository
