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
