import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import { playMusic } from '../lib/music'
import LandingPage from './LandingPage'

// Màn "cả nhóm cùng quét": camera không chạy được trong jsdom, nên giả lập
// hook quét ở đúng lúc máy đã nhận ra hai bạn
const face = vi.hoisted(() => ({
  accept: vi.fn(),
  retry: vi.fn(),
  people: [],
}))

vi.mock('../hooks/useFaceScan', () => ({
  default: () => ({
    active: true,
    status: 'choose',
    hint: '',
    kind: null,
    message: '',
    title: '',
    candidate: null,
    people: face.people,
    secondsLeft: 30,
    canRetry: false,
    videoRef: { current: null },
    open: vi.fn(),
    close: vi.fn(),
    accept: face.accept,
    deny: vi.fn(),
    retry: face.retry,
    claim: vi.fn(),
  }),
}))

// Nhạc nền: chỉ cần biết Face ID có gọi bật nhạc (lib/music lo việc không phát chồng)
vi.mock('../lib/music', () => ({ playMusic: vi.fn(), primeMusic: vi.fn(), releaseMusic: vi.fn() }))

vi.mock('../hooks/useEventStatus', () => ({
  default: () => ({ status: null, refresh: vi.fn() }),
}))

vi.mock('../api/giftRepository', () => ({
  default: {
    faceStatus: vi.fn(),
    recordOpen: vi.fn(),
    getGift: vi.fn(),
    resolveStudent: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom của bộ test không có Web Storage: bộ nhớ giả để giữ vé mở quà
  const data = new Map()
  vi.stubGlobal('localStorage', { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) })
  face.people = [
    { studentId: 10, giftPath: '/gift/thuy', displayName: 'Thủy Phin', avatarUrl: 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/thuy.png', score: 0.7 },
    { studentId: 11, giftPath: '/gift/my', displayName: 'My Tường', avatarUrl: null, score: 0.66, ticket: 've-my' },
  ]
  giftRepository.faceStatus.mockResolvedValue({ enabled: false })
  giftRepository.recordOpen.mockResolvedValue({ counted: true })
  giftRepository.getGift.mockResolvedValue({ full_name: 'Thủy', nickname: 'Thủy Phin' })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

test('nhận ra cả nhóm: chào đúng tên, hỏi mở quà cho ai, mỗi bạn một thiệp', () => {
  renderPage()
  expect(screen.getByText('Chào Thủy Phin và My Tường! 🌷')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Cậu muốn mở quà cho ai nào?' })).toBeTruthy()
  const cards = screen.getAllByRole('button').filter((button) => button.className.includes('match-card'))
  // Thủy có ảnh đại diện; My chưa có thì hiện chữ cái đầu
  expect(cards.map((card) => card.textContent.trim())).toEqual(['Thủy Phin', 'MMy Tường'])
  // Ảnh đại diện là bản thu nhỏ 160px, không phải ảnh gốc vài MB
  const avatar = cards[0].querySelector('img')
  expect(avatar.getAttribute('src')).toContain('/image/upload/f_auto,q_auto,c_fill,g_face,w_160,h_160/')
})

test('chọn một thiệp thì mở quà của đúng bạn đó', async () => {
  face.accept.mockImplementation((person) => person)
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /My Tường/ }))
  expect(face.accept).toHaveBeenCalledWith(face.people[1])
  // Nhận ra bạn rồi đưa vào trang quà: nhạc tự bật — một lần, ngay trong cú bấm
  expect(playMusic).toHaveBeenCalledTimes(1)
  // Vé mở quà máy chủ cấp được giữ lại trên máy (mở lại trang không cần quét lại)
  expect(JSON.parse(localStorage.getItem('gift_tickets') || '{}').my).toBe('ve-my')
  await waitFor(() => expect(giftRepository.getGift).toHaveBeenCalledWith('my'))
})

test('bấm thiệp mà máy quét không nhận (đã đóng) thì không bật nhạc', () => {
  face.accept.mockReturnValue(null)
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /My Tường/ }))
  expect(playMusic).not.toHaveBeenCalled()
})

test('"Quét lại" chạy lại máy quét', () => {
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: 'Quét lại' }))
  expect(face.retry).toHaveBeenCalled()
})
