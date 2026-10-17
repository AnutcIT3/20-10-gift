import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import LandingPage from './LandingPage'

// Hook quét được giả lập ở trạng thái nghỉ; chỉ cần biết trang hỏi nhóm nào
const scanCalls = vi.hoisted(() => [])

vi.mock('../hooks/useFaceScan', () => ({
  default: (options) => {
    scanCalls.push(options)
    return {
      active: false, status: 'idle', hint: '', kind: null, message: '', title: '', candidate: null, people: [],
      secondsLeft: 30, canRetry: false, videoRef: { current: null },
      open: vi.fn(), close: vi.fn(), accept: vi.fn(), deny: vi.fn(), retry: vi.fn(), claim: vi.fn(),
    }
  },
}))

vi.mock('../hooks/useEventStatus', () => ({
  default: () => ({ status: null, refresh: vi.fn() }),
}))

vi.mock('../api/giftRepository', () => ({
  default: { faceStatus: vi.fn(), resolveStudent: vi.fn(), getGift: vi.fn(), recordOpen: vi.fn() },
}))

const realSecure = window.isSecureContext
const realMedia = navigator.mediaDevices

beforeEach(() => {
  vi.clearAllMocks()
  scanCalls.length = 0
  // Có camera trên kết nối an toàn — điều kiện để thẻ Face ID được hỏi tới
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
})
afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'isSecureContext', { value: realSecure, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', { value: realMedia, configurable: true })
})

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

test('khách ghé thăm có Face ID riêng: hỏi đúng nhóm khách và quét trong thư viện khách', async () => {
  giftRepository.faceStatus.mockImplementation(async (scope) => ({ enabled: scope === 'friend' }))
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /Mình là khách ghé thăm/ }))

  expect(await screen.findByRole('button', { name: /Face ID/ })).toBeTruthy()
  expect(giftRepository.faceStatus).toHaveBeenCalledWith('friend')
  expect(scanCalls.at(-1)).toEqual({ scope: 'friend' })
})

test('chưa có khách nào đăng ký thì nhánh khách không có thẻ Face ID; nhánh lớp vẫn có', async () => {
  giftRepository.faceStatus.mockImplementation(async (scope) => ({ enabled: scope === 'class' }))
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /Mình là khách ghé thăm/ }))
  await waitFor(() => expect(giftRepository.faceStatus).toHaveBeenCalledWith('friend'))
  expect(screen.queryByRole('button', { name: /Face ID/ })).toBeNull()

  // Quay lại chọn "thành viên trong lớp": hỏi nhóm lớp, thẻ hiện, quét trong thư viện lớp
  fireEvent.click(screen.getByRole('button', { name: /Chọn lại/ }))
  fireEvent.click(await screen.findByRole('button', { name: /Mình là thành viên trong lớp/ }))
  expect(await screen.findByRole('button', { name: /Face ID/ })).toBeTruthy()
  expect(giftRepository.faceStatus).toHaveBeenCalledWith('class')
  expect(scanCalls.at(-1)).toEqual({ scope: 'class' })
})
