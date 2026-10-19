import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import LandingPage from './LandingPage'

// Trang quà khoá chờ 20/10: trang chủ chỉ còn đếm ngược và gửi lời chúc —
// không chọn vai trò, không tra tên để mở quà, không Face ID

const event = vi.hoisted(() => ({ status: null, justOpened: false }))

vi.mock('../hooks/useFaceScan', () => ({
  default: () => ({
    active: false, status: 'idle', hint: '', kind: null, message: '', title: '', candidate: null, people: [],
    secondsLeft: 30, canRetry: false, videoRef: { current: null },
    open: vi.fn(), close: vi.fn(), accept: vi.fn(), deny: vi.fn(), retry: vi.fn(), claim: vi.fn(),
  }),
}))

vi.mock('../hooks/useEventStatus', () => ({
  default: () => ({ status: event.status, offset: 0, justOpened: Boolean(event.justOpened), refresh: vi.fn() }),
}))

vi.mock('../api/giftRepository', () => ({
  default: {
    faceStatus: vi.fn(), resolveStudent: vi.fn(), getGift: vi.fn(), recordOpen: vi.fn(), createLetter: vi.fn(),
    createWishes: vi.fn(), createFriendLetter: vi.fn(), listWishRecipients: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  event.justOpened = false
  window.matchMedia = vi.fn(() => ({ matches: false }))
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
  giftRepository.faceStatus.mockResolvedValue({ enabled: true })
  giftRepository.listWishRecipients.mockResolvedValue(RECIPIENTS)
})
afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)
const RECIPIENTS = [
  { id: 17, name: 'Cô Giáo', nickname: '' },
  { id: 8, name: 'Diệu Linh', nickname: 'Linh Tần' },
  { id: 10, name: 'Thủy', nickname: 'Thủy Phin' },
  { id: 12, name: 'Ngọc', nickname: '' },
]

async function openWishDialog(buttonName) {
  fireEvent.click(screen.getByRole('button', { name: buttonName }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByLabelText(/Ẩn danh/))
  fireEvent.change(dialog.getByLabelText('Lời chúc'), { target: { value: 'Chúc mừng 20/10!' } })
  await dialog.findByRole('checkbox', { name: /Tất cả/ })
  return dialog
}
const submit = (dialog) => fireEvent.submit(dialog.getByLabelText('Lời chúc').closest('form'))
const LOCKED = { locked: true, unlockAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), total: 18, opened: 0, replies: 0 }

test('đang khoá: chỉ có đếm ngược và nút gửi lời chúc, không có lối vào trang cá nhân hay Face ID', () => {
  event.status = LOCKED
  renderPage()
  expect(screen.getByRole('region', { name: 'Đếm ngược tới lúc mở quà' })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Gửi lời chúc cho một bạn/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Mình là thành viên trong lớp/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Mình là khách ghé thăm/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Face ID/ })).toBeNull()
  expect(screen.queryByLabelText('Tên:')).toBeNull()
  expect(giftRepository.faceStatus).not.toHaveBeenCalled()
})

test('khoá mà chưa hẹn giờ thì hẹn ngày 20/10 thay cho đồng hồ', () => {
  event.status = { ...LOCKED, unlockAt: null }
  renderPage()
  expect(screen.queryByRole('region', { name: 'Đếm ngược tới lúc mở quà' })).toBeNull()
  expect(screen.getByText('Hẹn bạn ngày 20/10 nhé!')).toBeTruthy()
})

test('quà đã mở: trang chủ trở lại như cũ', () => {
  event.status = { ...LOCKED, locked: false, unlockAt: null }
  renderPage()
  expect(screen.getByRole('button', { name: /Mình là thành viên trong lớp/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Mình là khách ghé thăm/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Mình muốn gửi lời chúc cho một bạn/ })).toBeTruthy()
})

test('trang chủ có đống thư, số lời chúc và dòng "vừa xong" — cả lúc đang khoá', async () => {
  event.status = { ...LOCKED, serverNow: new Date().toISOString(), wishes: { shown: 24, lastAt: new Date(Date.now() - 2 * 60000).toISOString() } }
  const { container } = renderPage()
  await vi.waitFor(() => expect(container.querySelector('.wish-stats')).toHaveTextContent('✉ 24 lời chúc đã được gửi'))
  expect(screen.getByText(/Ai đó vừa gửi một lời chúc/)).toHaveTextContent('2 phút trước')
  expect(container.querySelectorAll('.wish-heap .wish-note')).toHaveLength(24)
  expect(container.querySelector('.wish-ghost')).toHaveTextContent('24')
})

test('máy chủ cũ chưa có số lời chúc thì không có đống thư hay dòng số lượng', () => {
  event.status = LOCKED
  const { container } = renderPage()
  expect(container.querySelector('.wish-heap')).toBeNull()
  expect(screen.queryByText(/lời chúc đã được gửi/)).toBeNull()
})

test('trang bị khoá giữa chừng rồi mở lại: quay về bước chọn vai trò', async () => {
  event.status = { ...LOCKED, locked: false, unlockAt: null }
  const view = renderPage()
  fireEvent.click(screen.getByRole('button', { name: /Mình là thành viên trong lớp/ }))
  expect(screen.getByLabelText(/Tên:/)).toBeTruthy()

  event.status = LOCKED
  view.rerender(<MemoryRouter><LandingPage /></MemoryRouter>)
  await vi.waitFor(() => expect(screen.queryByLabelText(/Tên:/)).toBeNull())
  // Thực tế khoá kéo dài cả 15 giây hỏi lại — cho bước dọn kịp chạy
  await act(() => new Promise((resolve) => { setTimeout(resolve, 20) }))

  event.status = { ...LOCKED, locked: false, unlockAt: null }
  view.rerender(<MemoryRouter><LandingPage /></MemoryRouter>)
  expect(await screen.findByRole('button', { name: /Mình là thành viên trong lớp/ })).toBeTruthy()
  expect(screen.queryByLabelText(/Tên:/)).toBeNull()
})

test('00:00 — quà vừa mở trước mắt: dấu vỡ, phong bì mở lá thư chúc mừng, mưa cánh hoa, số mờ thành "20.10"', async () => {
  event.status = { ...LOCKED, serverNow: new Date().toISOString(), wishes: { shown: 45, lastAt: null } }
  const view = renderPage()
  await vi.waitFor(() => expect(view.container.querySelector('.wish-ghost')).toHaveTextContent('45'))
  expect(view.container.querySelector('.petal-rain')).toBeNull()

  event.status = { ...event.status, locked: false, unlockAt: null }
  event.justOpened = true
  view.rerender(<MemoryRouter><LandingPage /></MemoryRouter>)
  await vi.waitFor(() => expect(view.container.querySelector('.petal-rain')).not.toBeNull())
  expect(view.container.querySelector('.wish-ghost')).toHaveTextContent('20.10')
  expect(view.container.querySelector('.seal-crack')).not.toBeNull()
  expect(view.container.querySelector('.envelope--open .envelope__letter')).toHaveTextContent('Chúc mừng 20/10! 💐')
  expect(screen.getByText(/Quà đã mở rồi!/)).toBeTruthy()
})

test('máy đặt "giảm chuyển động" thì không có mưa cánh hoa', async () => {
  window.matchMedia = vi.fn(() => ({ matches: true }))
  event.status = { ...LOCKED, locked: false, unlockAt: null, wishes: { shown: 45, lastAt: null } }
  event.justOpened = true
  const view = renderPage()
  await vi.waitFor(() => expect(view.container.querySelector('.wish-ghost')).toHaveTextContent('20.10'))
  expect(view.container.querySelector('.petal-rain')).toBeNull()
})


test('khung gửi lời chúc có danh sách các bạn và cô kèm biệt danh để tích; gửi cho những bạn đã tích', async () => {
  event.status = LOCKED
  giftRepository.createWishes.mockResolvedValue({ status: 'pending', created: 2, wish_number: 52 })
  renderPage()
  const dialog = await openWishDialog(/Gửi lời chúc cho một bạn/)
  // Tên + biệt danh, không có ảnh
  expect(dialog.getByRole('checkbox', { name: /Diệu Linh.*Linh Tần/ })).toBeTruthy()
  expect(dialog.getByRole('checkbox', { name: /Cô Giáo/ })).toBeTruthy()
  expect(dialog.queryAllByRole('img')).toHaveLength(0)

  fireEvent.click(dialog.getByRole('checkbox', { name: /Thủy/ }))
  fireEvent.click(dialog.getByRole('checkbox', { name: /Cô Giáo/ }))
  expect(dialog.getByText(/Sẽ gửi tới 2 người/)).toBeTruthy()
  submit(dialog)
  await vi.waitFor(() => expect(giftRepository.createWishes).toHaveBeenCalledTimes(1))
  const [recipients, data, files] = giftRepository.createWishes.mock.calls[0]
  expect(recipients).toEqual([{ id: 10 }, { id: 17 }])
  expect(data).toEqual(expect.objectContaining({ content: 'Chúc mừng 20/10!', is_anonymous: true }))
  expect(files).toEqual([])
  expect(await dialog.findByText('Đã gửi tới 2 người nhận.')).toBeTruthy()
  expect(dialog.getByText(/Bạn là người gửi lời chúc thứ/)).toHaveTextContent('52')
})

test('"Tất cả" chọn cả lớp một lần, bấm lại là bỏ hết; thêm được bạn ngoài lớp', async () => {
  event.status = { ...LOCKED, locked: false, unlockAt: null }
  giftRepository.createWishes.mockResolvedValue({ status: 'pending', created: 5 })
  renderPage()
  const dialog = await openWishDialog(/Mình muốn gửi lời chúc/)
  const all = dialog.getByRole('checkbox', { name: /Tất cả \(4\)/ })
  const people = () => within(dialog.getByRole('list', { name: 'Các bạn trong lớp' })).getAllByRole('checkbox')
  fireEvent.click(all)
  expect(people().every((box) => box.checked)).toBe(true)
  fireEvent.click(all)
  expect(people().some((box) => box.checked)).toBe(false)
  fireEvent.click(all)

  fireEvent.click(dialog.getByRole('radio', { name: /Ngoài lớp/ }))
  fireEvent.change(dialog.getByLabelText('Tên bạn ngoài lớp'), { target: { value: 'Minh Thư' } })
  fireEvent.click(dialog.getByRole('button', { name: '＋ Thêm' }))
  expect(dialog.getByRole('button', { name: 'Bỏ Minh Thư' })).toBeTruthy()
  // Tên còn trong ô lúc gửi cũng được tính
  fireEvent.change(dialog.getByLabelText('Tên bạn ngoài lớp'), { target: { value: 'Bảo Anh' } })
  submit(dialog)
  await vi.waitFor(() => expect(giftRepository.createWishes).toHaveBeenCalledTimes(1))
  expect(giftRepository.createWishes.mock.calls[0][0]).toEqual([
    { id: 17 }, { id: 8 }, { id: 10 }, { id: 12 }, { friend: 'Minh Thư' }, { friend: 'Bảo Anh' },
  ])
})

test('chưa chọn ai thì báo, không gửi', async () => {
  event.status = LOCKED
  renderPage()
  const dialog = await openWishDialog(/Gửi lời chúc cho một bạn/)
  submit(dialog)
  expect(await dialog.findByRole('alert')).toHaveTextContent('Chọn ít nhất một người nhận')
  expect(giftRepository.createWishes).not.toHaveBeenCalled()
})
