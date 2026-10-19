import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import { playMusic, primeMusic, releaseMusic } from '../lib/music'
import LandingPage from './LandingPage'

// Gõ tên rồi mở quà: nhạc nền chạy tắt tiếng ngay trong cú bấm, tra ra trang
// quà thì bật tiếng, không ra thì dừng. lib/music lo việc chỉ có một bản nhạc.
vi.mock('../lib/music', () => ({ playMusic: vi.fn(), primeMusic: vi.fn(), releaseMusic: vi.fn() }))

vi.mock('../hooks/useFaceScan', () => ({
  default: () => ({
    active: false, status: 'idle', hint: '', kind: null, message: '', title: '', candidate: null, people: [],
    secondsLeft: 30, canRetry: false, videoRef: { current: null },
    open: vi.fn(), close: vi.fn(), accept: vi.fn(), deny: vi.fn(), retry: vi.fn(), claim: vi.fn(),
  }),
}))

vi.mock('../hooks/useEventStatus', () => ({
  default: () => ({ status: null, refresh: vi.fn() }),
}))

vi.mock('../api/giftRepository', () => ({
  default: { faceStatus: vi.fn(), resolveStudent: vi.fn(), getGift: vi.fn(), recordOpen: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  giftRepository.faceStatus.mockResolvedValue({ enabled: false })
  giftRepository.getGift.mockResolvedValue({ full_name: 'Thủy', nickname: 'Thủy Phin' })
  giftRepository.recordOpen.mockResolvedValue({ counted: true, rank: 1 })
})
afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

async function typeName(value, role = /Mình là thành viên trong lớp/) {
  fireEvent.click(await screen.findByRole('button', { name: role }))
  const input = await screen.findByRole('textbox')
  fireEvent.change(input, { target: { value } })
  fireEvent.submit(input.closest('form'))
}

test('gõ tên ra đúng trang quà: nhạc chạy (tắt tiếng) ngay lúc bấm, rồi bật tiếng — đúng một lần', async () => {
  giftRepository.resolveStudent.mockResolvedValue({ giftPath: '/gift/thuy' })
  renderPage()
  await typeName('Thủy Phin')
  // Ngay trong cú bấm, trước khi máy chủ trả lời
  expect(primeMusic).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(playMusic).toHaveBeenCalledTimes(1))
  expect(releaseMusic).not.toHaveBeenCalled()
  await waitFor(() => expect(giftRepository.getGift).toHaveBeenCalledWith('thuy'))
})

test('trùng tên: chưa bật nhạc; chọn thiệp của mình thì nhạc bật (một lần)', async () => {
  giftRepository.resolveStudent.mockResolvedValue({
    matches: [
      { displayName: 'Thúy', nickname: '', giftPath: '/gift/thuy-sac', avatarUrl: '' },
      { displayName: 'Thủy', nickname: 'Thủy Phin', giftPath: '/gift/thuy', avatarUrl: '' },
    ],
    message: 'Có 2 bạn trùng tên. Chọn bạn cần tìm?',
  })
  renderPage()
  await typeName('thuy')
  await screen.findByRole('button', { name: /Thủy Phin/ })
  expect(releaseMusic).toHaveBeenCalledTimes(1)
  expect(playMusic).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /Thủy Phin/ }))
  expect(playMusic).toHaveBeenCalledTimes(1)
})

test('không tìm thấy tên trong lớp: nhạc dừng lại, không phát', async () => {
  giftRepository.resolveStudent.mockResolvedValue({})
  renderPage()
  await typeName('Ai Đó')
  expect(await screen.findByText('Không tìm thấy tên này trong danh sách.')).toBeTruthy()
  expect(releaseMusic).toHaveBeenCalledTimes(1)
  expect(playMusic).not.toHaveBeenCalled()
})

test('khách gõ tên ra trang quà riêng thì cũng có nhạc', async () => {
  giftRepository.resolveStudent.mockResolvedValue({ giftPath: '/gift/hai-anh' })
  renderPage()
  await typeName('Hải Anh', /Mình là khách ghé thăm/)
  expect(primeMusic).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(playMusic).toHaveBeenCalledTimes(1))
  expect(giftRepository.resolveStudent).toHaveBeenCalledWith('Hải Anh', 'friend')
})

test('mất mạng khi tra tên: nhạc dừng, báo lỗi', async () => {
  giftRepository.resolveStudent.mockRejectedValue(Object.assign(new Error('offline'), { isNetworkError: true }))
  renderPage()
  await typeName('Thủy')
  expect(await screen.findByText(/offline/)).toBeTruthy()
  expect(releaseMusic).toHaveBeenCalledTimes(1)
  expect(playMusic).not.toHaveBeenCalled()
})
