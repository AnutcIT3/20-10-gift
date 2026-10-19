import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import GiftPage from './GiftPage'

// services/api đọc localStorage (mã phiên) ngay khi nạp — jsdom trong test không có
vi.mock('../services/api', () => ({ default: { post: vi.fn() } }))
vi.mock('../api/giftRepository', () => ({
  default: {
    getGiftContent: vi.fn(),
    generateGreeting: vi.fn(),
    recordOpen: vi.fn(),
  },
}))

const CONTENT = {
  student: { id: 3, full_name: 'Nguyễn Thúy Vy', nickname: 'Vy', member_type: 'class' },
  gallery: [],
  letters: [],
  replies: [],
}

beforeEach(() => {
  giftRepository.getGiftContent.mockReset().mockResolvedValue(CONTENT)
  giftRepository.generateGreeting.mockReset().mockResolvedValue({ greeting: 'Chúc Vy vui' })
  giftRepository.recordOpen.mockReset().mockResolvedValue({ counted: true, rank: 3, opened: 3, total: 23 })
})
afterEach(cleanup)

function renderGift(state) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/gift/12a1-vy', state }]}>
      <Routes><Route path="/gift/:accessCode" element={<GiftPage />} /></Routes>
    </MemoryRouter>,
  )
}

test('gõ tên lúc quà còn khoá rồi chờ tới giờ: quà mở ra thì lượt mở được ghi và biết mình là bạn thứ mấy', async () => {
  renderGift({ pendingOpen: { via: 'face', at: Date.now() } })
  expect(await screen.findByText(/bạn thứ 3 mở quà/)).toBeTruthy()
  expect(giftRepository.recordOpen).toHaveBeenCalledTimes(1)
  expect(giftRepository.recordOpen).toHaveBeenCalledWith('12a1-vy', 'face')
})

test('mở thẳng bằng link thì không ghi lượt mở — hoa chỉ đếm lượt mở từ trang chủ', async () => {
  renderGift(undefined)
  await waitFor(() => expect(giftRepository.getGiftContent).toHaveBeenCalled())
  expect(await screen.findByRole('heading', { name: /Cất quà vào máy/ })).toBeTruthy()
  expect(giftRepository.recordOpen).not.toHaveBeenCalled()
})

test('tab thử cũ được khôi phục vài ngày sau không lén góp cánh hoa', async () => {
  renderGift({ pendingOpen: { via: 'name', at: Date.now() - 3 * 24 * 60 * 60 * 1000 } })
  expect(await screen.findByRole('heading', { name: /Cất quà vào máy/ })).toBeTruthy()
  expect(giftRepository.recordOpen).not.toHaveBeenCalled()
})

test('hồ sơ bạn ngoài lớp không góp cánh cho bông hoa của lớp', async () => {
  giftRepository.getGiftContent.mockResolvedValue({ ...CONTENT, student: { ...CONTENT.student, member_type: 'friend' } })
  renderGift({ pendingOpen: { via: 'name', at: Date.now() } })
  expect(await screen.findByRole('heading', { name: /Cất quà vào máy/ })).toBeTruthy()
  expect(giftRepository.recordOpen).not.toHaveBeenCalled()
})

const FRIEND = { id: 29, full_name: 'Trần Hoàng Quyên', nickname: 'quyeniuu', member_type: 'friend' }

test('trang của khách ngoài lớp không mang tên lớp: không có "K49 - 12A1" ở đâu cả', async () => {
  giftRepository.getGiftContent.mockResolvedValue({ ...CONTENT, student: { ...FRIEND, close_friend: false } })
  const { container } = renderGift(undefined)
  expect(await screen.findByRole('heading', { name: /Cất quà vào máy/ })).toBeTruthy()
  expect(container.textContent).not.toMatch(/K49|12A1/)
  expect(screen.getAllByText(/Một món quà nhỏ · 20\.10\./).length).toBe(2)
  expect(screen.getByText('cho các bạn nam')).toBeTruthy()
})

test('khách có Face ID là bạn thân: lời chúc thân mật, gọi bằng biệt danh — khách thường giữ lời chúc lịch sự', async () => {
  giftRepository.getGiftContent.mockResolvedValue({ ...CONTENT, student: { ...FRIEND, close_friend: true } })
  renderGift(undefined)
  await waitFor(() => expect(giftRepository.generateGreeting).toHaveBeenCalledWith('quyeniuu', 'close_friend'))
  cleanup()

  giftRepository.generateGreeting.mockClear()
  giftRepository.getGiftContent.mockResolvedValue({ ...CONTENT, student: { ...FRIEND, close_friend: false } })
  renderGift(undefined)
  await waitFor(() => expect(giftRepository.generateGreeting).toHaveBeenCalledWith('Trần Hoàng Quyên', 'visitor'))
})

test('trang của bạn trong lớp vẫn giữ tên lớp', async () => {
  renderGift(undefined)
  expect(await screen.findByRole('heading', { name: /Cất quà vào máy/ })).toBeTruthy()
  expect(screen.getAllByText(/Lớp K49 - 12A1 · 20\.10\./).length).toBe(2)
  await waitFor(() => expect(giftRepository.generateGreeting).toHaveBeenCalledWith('Nguyễn Thúy Vy', 'student'))
})

test('ảnh kèm lời chúc riêng, 💌 admin và ✨ tự động hiện đúng chỗ cũ của từng loại', async () => {
  const url = (name) => `https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/${name}.jpg`
  giftRepository.getGiftContent.mockResolvedValue({
    ...CONTENT,
    student: {
      ...CONTENT.student,
      intro_message: 'Gửi cô bạn bàn đầu',
      intro_image_url: url('intro'),
      admin_wish: 'Chúc Vy luôn cười',
      admin_wish_image_url: url('admin'),
      greeting_image_url: url('auto'),
    },
  })
  renderGift(undefined)
  const intro = await screen.findByRole('img', { name: 'Ảnh kèm lời chúc riêng' })
  expect(intro.closest('.hero')).toBeTruthy()
  expect(screen.getByText('Chúc Vy luôn cười').closest('.ai-note--admin').querySelector('.ai-note__photo')).toBeTruthy()
  // Ảnh của lời chúc tự động nằm trong ô ✨, hiện khi lời chúc đã viết xong
  await waitFor(() => expect(document.querySelectorAll('.ai-note:not(.ai-note--admin) .ai-note__photo')).toHaveLength(1))
})

test('admin đã tự viết lời chúc ✨ thì trang quà dùng đúng câu đó, máy không viết nữa', async () => {
  giftRepository.getGiftContent.mockResolvedValue({
    ...CONTENT, student: { ...CONTENT.student, greeting_custom: 'Chúc Vy 20/10 rực rỡ — tụi tớ viết riêng' },
  })
  renderGift(undefined)
  expect(await screen.findByRole('heading', { name: /Cất quà vào máy/ })).toBeTruthy()
  await waitFor(() => expect(document.querySelector('.ai-note:not(.ai-note--admin)')).toBeTruthy())
  expect(giftRepository.generateGreeting).not.toHaveBeenCalled()
})

test('nhiều lời chúc riêng hiện lần lượt dưới tên; mỗi lời 💌 một ô, hồi âm admin chỉ ở ô cuối', async () => {
  giftRepository.getGiftContent.mockResolvedValue({
    ...CONTENT,
    student: {
      ...CONTENT.student,
      intro_message: 'Lời riêng một',
      intro_notes: [{ id: 1, content: 'Lời riêng hai', images: [{ id: 9, url: 'https://res.cloudinary.com/demo/image/upload/i2.jpg' }] }],
      admin_wish: 'Lời admin một',
      admin_wish_notes: [
        { id: 2, content: 'Lời admin hai', images: [] },
        { id: 3, content: '', images: [] }, // lời trống không ảnh thì không có ô
        { id: 4, content: 'Lời admin bốn', images: [] },
      ],
    },
  })
  renderGift(undefined)
  expect(await screen.findByText('Lời riêng một')).toBeTruthy()
  expect(screen.getByText('Lời riêng hai')).toBeTruthy()
  expect(screen.getByRole('img', { name: 'Ảnh kèm lời chúc riêng' })).toBeTruthy()

  const boxes = document.querySelectorAll('.ai-note--admin')
  expect([...boxes].map((box) => box.querySelector('p')?.textContent)).toEqual(['Lời admin một', 'Lời admin hai', 'Lời admin bốn'])
  expect(screen.getAllByRole('button', { name: /Hồi âm admin/ })).toHaveLength(1)
  expect(boxes[2].textContent).toContain('Hồi âm admin')
})

test('đang "Chỉ mở bằng Face ID" mà máy này chưa có vé: trang báo mở bằng Face ID, không hiện quà', async () => {
  giftRepository.getGiftContent.mockRejectedValue(Object.assign(
    new Error('Trang quà này chỉ mở bằng Face ID — về trang chủ, chọn "thành viên trong lớp" và quét Face ID nhé ✨'),
    { status: 403, data: { code: 'face_only' } },
  ))
  renderGift(undefined)
  expect(await screen.findByRole('heading', { name: 'Mở quà bằng Face ID nhé' })).toBeTruthy()
  expect(screen.getByRole('alert')).toHaveTextContent('chỉ mở bằng Face ID')
  expect(screen.getByRole('link', { name: 'Về trang chủ' })).toBeTruthy()
})
