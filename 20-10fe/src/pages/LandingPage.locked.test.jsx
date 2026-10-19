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
    createWishes: vi.fn(), createFriendLetter: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  event.justOpened = false
  window.matchMedia = vi.fn(() => ({ matches: false }))
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
  giftRepository.faceStatus.mockResolvedValue({ enabled: true })
})
afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)
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

test('đang khoá vẫn gửi được lời chúc; trùng tên thì chọn theo họ tên kèm biệt danh, không có ảnh', async () => {
  event.status = LOCKED
  // Máy chủ đang khoá trả danh sách không ảnh, không chỗ ngồi
  giftRepository.resolveStudent.mockResolvedValue({
    matches: [
      { displayName: 'Diệu Linh', nickname: 'Linh Tần', avatarUrl: '', giftPath: '/gift/a', seatRow: null, seatCol: null },
      { displayName: 'Phương Linh', nickname: '', avatarUrl: '', giftPath: '/gift/b', seatRow: null, seatCol: null },
    ],
  })
  giftRepository.createLetter.mockResolvedValue({ status: 'pending', wish_number: 25 })
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /Gửi lời chúc cho một bạn/ }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByLabelText(/Ẩn danh/))
  fireEvent.change(dialog.getByLabelText('Tên người nhận'), { target: { value: 'linh' } })
  fireEvent.change(dialog.getByLabelText('Lời chúc'), { target: { value: 'Chúc mừng 20/10!' } })
  fireEvent.submit(dialog.getByLabelText('Lời chúc').closest('form'))

  const first = await dialog.findByRole('button', { name: /Diệu Linh/ })
  expect(first).toHaveTextContent('"Linh Tần"')
  expect(dialog.getByRole('button', { name: /Phương Linh/ })).toBeTruthy()
  expect(dialog.queryAllByRole('img')).toHaveLength(0)
  fireEvent.click(first)
  await vi.waitFor(() => expect(giftRepository.createLetter).toHaveBeenCalledWith('a', expect.objectContaining({ content: 'Chúc mừng 20/10!' }), []))

  // Màn "Thư đã vào hộp": người gửi biết mình là người thứ mấy
  expect(await dialog.findByText(/Bạn là người gửi lời chúc thứ/)).toHaveTextContent('Bạn là người gửi lời chúc thứ 25!')
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

test('đổi người nhận (trong/ngoài lớp, hay sửa tên) thì bỏ danh sách trùng tên cũ, giữ lời chúc đang viết', async () => {
  event.status = { ...LOCKED, locked: false, unlockAt: null }
  giftRepository.resolveStudent.mockResolvedValue({
    matches: [
      { displayName: 'Diệu Linh', nickname: 'Linh Tần', avatarUrl: '', giftPath: '/gift/a', seatRow: null, seatCol: null },
      { displayName: 'Phương Linh', nickname: '', avatarUrl: '', giftPath: '/gift/b', seatRow: null, seatCol: null },
    ],
  })
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /Mình muốn gửi lời chúc/ }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByLabelText(/Ẩn danh/))
  fireEvent.change(dialog.getByLabelText('Tên người nhận'), { target: { value: 'linh' } })
  fireEvent.change(dialog.getByLabelText('Lời chúc'), { target: { value: 'Chúc mừng 20/10!' } })
  const form = dialog.getByLabelText('Lời chúc').closest('form')
  fireEvent.submit(form)
  expect(await dialog.findByRole('button', { name: /Diệu Linh/ })).toBeTruthy()

  fireEvent.click(dialog.getByRole('radio', { name: 'Ngoài lớp' }))
  expect(dialog.queryByRole('button', { name: /Diệu Linh/ })).toBeNull()

  fireEvent.click(dialog.getByRole('radio', { name: 'Trong lớp' }))
  fireEvent.submit(form)
  expect(await dialog.findByRole('button', { name: /Diệu Linh/ })).toBeTruthy()
  fireEvent.change(dialog.getByLabelText('Tên người nhận'), { target: { value: 'Ngọc' } })
  expect(dialog.queryByRole('button', { name: /Diệu Linh/ })).toBeNull()
  expect(dialog.getByLabelText('Lời chúc')).toHaveValue('Chúc mừng 20/10!')
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

test('một lời chúc gửi cho nhiều bạn: thêm từng người (trùng tên thì chọn), bỏ bớt, rồi gửi một lần', async () => {
  event.status = LOCKED
  giftRepository.resolveStudent.mockImplementation(async (name) => {
    if (name === 'Thủy') return { giftPath: '/gift/thuy' }
    if (name === 'linh') {
      return {
        matches: [
          { displayName: 'Diệu Linh', nickname: 'Linh Tần', avatarUrl: '', giftPath: '/gift/a', seatRow: null, seatCol: null },
          { displayName: 'Phương Linh', nickname: '', avatarUrl: '', giftPath: '/gift/b', seatRow: null, seatCol: null },
        ],
      }
    }
    if (name === 'Ngọc') return { giftPath: '/gift/ngoc' }
    throw Object.assign(new Error('not found'), { status: 404 })
  })
  giftRepository.createWishes.mockResolvedValue({ status: 'pending', created: 4, wish_number: 52 })
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /Gửi lời chúc cho một bạn/ }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByLabelText(/Ẩn danh/))
  fireEvent.change(dialog.getByLabelText('Lời chúc'), { target: { value: 'Chúc cả nhà 20/10!' } })
  const name = dialog.getByLabelText('Tên người nhận')
  const add = () => fireEvent.click(dialog.getByRole('button', { name: /Thêm người nhận/ }))

  fireEvent.change(name, { target: { value: 'Thủy' } })
  add()
  expect(await dialog.findByRole('button', { name: 'Bỏ Thủy' })).toBeTruthy()
  expect(name).toHaveValue('')

  // Trùng tên: chọn trong danh sách là thêm, chưa gửi
  fireEvent.change(name, { target: { value: 'linh' } })
  add()
  fireEvent.click(await dialog.findByRole('button', { name: /Diệu Linh/ }))
  expect(await dialog.findByRole('button', { name: 'Bỏ Diệu Linh' })).toBeTruthy()
  expect(giftRepository.createWishes).not.toHaveBeenCalled()

  // Bạn ngoài lớp
  fireEvent.click(dialog.getByRole('radio', { name: 'Ngoài lớp' }))
  fireEvent.change(name, { target: { value: 'Minh Thư' } })
  add()
  expect(await dialog.findByRole('button', { name: 'Bỏ Minh Thư' })).toBeTruthy()

  // Thêm rồi bỏ một người; thêm trùng thì không nhân đôi
  fireEvent.click(dialog.getByRole('radio', { name: 'Trong lớp' }))
  fireEvent.change(name, { target: { value: 'Thủy' } })
  add()
  await vi.waitFor(() => expect(name).toHaveValue(''))
  expect(dialog.getAllByRole('button', { name: 'Bỏ Thủy' })).toHaveLength(1)
  fireEvent.click(dialog.getByRole('button', { name: 'Bỏ Diệu Linh' }))

  // Tên còn trong ô lúc bấm gửi cũng được tính
  fireEvent.change(name, { target: { value: 'Ngọc' } })
  fireEvent.submit(dialog.getByLabelText('Lời chúc').closest('form'))
  await vi.waitFor(() => expect(giftRepository.createWishes).toHaveBeenCalledTimes(1))
  const [recipients, data, files] = giftRepository.createWishes.mock.calls[0]
  expect(recipients).toEqual([{ code: 'thuy' }, { friend: 'Minh Thư' }, { code: 'ngoc' }])
  expect(data).toEqual(expect.objectContaining({ content: 'Chúc cả nhà 20/10!', is_anonymous: true }))
  expect(files).toEqual([])
  expect(await dialog.findByText('Đã gửi tới 3 người nhận.')).toBeTruthy()
  expect(dialog.getByText(/Bạn là người gửi lời chúc thứ/)).toHaveTextContent('52')
  expect(giftRepository.createLetter).not.toHaveBeenCalled()
})

test('chỉ một người nhận thì vẫn gửi như cũ, không qua đường gửi nhiều người', async () => {
  event.status = LOCKED
  giftRepository.resolveStudent.mockResolvedValue({ giftPath: '/gift/thuy' })
  giftRepository.createLetter.mockResolvedValue({ status: 'pending', wish_number: 48 })
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: /Gửi lời chúc cho một bạn/ }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByLabelText(/Ẩn danh/))
  fireEvent.change(dialog.getByLabelText('Tên người nhận'), { target: { value: 'Thủy' } })
  fireEvent.change(dialog.getByLabelText('Lời chúc'), { target: { value: 'Chúc mừng!' } })
  fireEvent.submit(dialog.getByLabelText('Lời chúc').closest('form'))
  await vi.waitFor(() => expect(giftRepository.createLetter).toHaveBeenCalledTimes(1))
  expect(giftRepository.createWishes).not.toHaveBeenCalled()
})
