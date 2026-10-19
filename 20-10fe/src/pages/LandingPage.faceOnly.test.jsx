import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import LandingPage from './LandingPage'

// Admin bật "Chỉ mở bằng Face ID": trang chủ không còn ô gõ tên
const event = vi.hoisted(() => ({ status: null }))

vi.mock('../hooks/useFaceScan', () => ({
  default: () => ({
    active: false, status: 'idle', hint: '', kind: null, message: '', title: '', candidate: null, people: [],
    secondsLeft: 30, canRetry: false, videoRef: { current: null },
    open: vi.fn(), close: vi.fn(), accept: vi.fn(), deny: vi.fn(), retry: vi.fn(), claim: vi.fn(),
  }),
}))

vi.mock('../hooks/useEventStatus', () => ({
  default: () => ({ status: event.status, offset: 0, justOpened: false, refresh: vi.fn() }),
}))

vi.mock('../api/giftRepository', () => ({
  default: { faceStatus: vi.fn(), resolveStudent: vi.fn(), getGift: vi.fn(), recordOpen: vi.fn() },
}))

const realSecure = window.isSecureContext
const realMedia = navigator.mediaDevices
const OPEN = { locked: false, unlockAt: null, total: 18, opened: 17, replies: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
})
afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'isSecureContext', { value: realSecure, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', { value: realMedia, configurable: true })
})

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

test('chỉ mở bằng Face ID: không có ô gõ tên, chỉ còn thẻ Face ID', async () => {
  event.status = { ...OPEN, faceOnly: true }
  giftRepository.faceStatus.mockResolvedValue({ enabled: true })
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /Mình là thành viên trong lớp/ }))
  expect(await screen.findByRole('button', { name: /Face ID/ })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Mở quà bằng Face ID' })).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Mở quà' })).toBeNull()
  expect(giftRepository.resolveStudent).not.toHaveBeenCalled()
})

test('chỉ mở bằng Face ID mà máy không dùng được Face ID: nói rõ, vẫn không có ô gõ tên', async () => {
  event.status = { ...OPEN, faceOnly: true }
  giftRepository.faceStatus.mockResolvedValue({ enabled: false })
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /Mình là thành viên trong lớp/ }))
  await waitFor(() => expect(giftRepository.faceStatus).toHaveBeenCalledWith('class'))
  expect(screen.getByText(/máy này chưa dùng được/)).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
})

test('chỉ mở bằng Face ID: khách ngoài lớp vẫn gõ tên được', async () => {
  event.status = { ...OPEN, faceOnly: true }
  giftRepository.faceStatus.mockResolvedValue({ enabled: true })
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /Mình là khách ghé thăm/ }))
  expect(await screen.findByRole('textbox')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Tên của bạn là gì?' })).toBeTruthy()
})

test('tắt công tắc thì gõ tên như thường', async () => {
  event.status = { ...OPEN, faceOnly: false }
  giftRepository.faceStatus.mockResolvedValue({ enabled: true })
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /Mình là thành viên trong lớp/ }))
  expect(await screen.findByRole('textbox')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Tên của bạn là gì?' })).toBeTruthy()
})
