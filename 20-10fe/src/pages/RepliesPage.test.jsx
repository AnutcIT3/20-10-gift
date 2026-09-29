import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import RepliesPage from './RepliesPage'

vi.mock('../api/giftRepository', () => ({ default: { listReplies: vi.fn() } }))

beforeEach(() => {
  giftRepository.listReplies.mockReset()
})
afterEach(cleanup)

function renderPage(path = '/hoi-am') {
  return render(<MemoryRouter initialEntries={[path]}><RepliesPage /></MemoryRouter>)
}

test('mỗi hồi âm là một bưu thiếp: ai gửi ai, người ẩn danh chỉ được nhắc lúc gửi thư', async () => {
  giftRepository.listReplies.mockResolvedValue({
    total: 3,
    items: [
      { id: 3, content: 'Cảm ơn Tuấn!', created_at: '2026-10-20T01:00:00.000Z', from: { name: 'Vy' }, to: { kind: 'person', name: 'Tuấn' } },
      { id: 2, content: 'Ai vậy ta?', created_at: '2026-10-20T00:30:00.000Z', from: { name: 'Mai Anh' }, to: { kind: 'anonymous', letterSentAt: '2026-10-18T14:30:00.000Z' } },
      { id: 1, content: 'Yêu cả lớp', created_at: '2026-10-20T00:10:00.000Z', from: { name: 'Hà' }, to: { kind: 'class' } },
    ],
  })
  renderPage()

  expect(await screen.findByText('Cảm ơn Tuấn!')).toBeTruthy()
  expect(screen.getByText('Tuấn')).toBeTruthy()
  expect(screen.getByText('một người bạn ẩn danh')).toBeTruthy()
  expect(screen.getByText(/người đã gửi thư lúc/)).toBeTruthy()
  expect(screen.getByText('cả lớp 12A1')).toBeTruthy()
  expect(screen.getByText('3 hồi âm')).toBeTruthy()
  expect(giftRepository.listReplies).toHaveBeenCalledWith({ to: undefined, exact: false })
})

test('mở từ lời nhắc "có thư hồi âm gửi cậu" thì lọc sẵn theo tên, khớp trọn chữ như lời nhắc', async () => {
  giftRepository.listReplies.mockResolvedValue({ total: 0, items: [] })
  renderPage('/hoi-am?to=Tu%E1%BA%A5n&exact=1')
  await waitFor(() => expect(giftRepository.listReplies).toHaveBeenCalledWith({ to: 'Tuấn', exact: true }))
  expect(await screen.findByText(/Chưa có hồi âm nào gửi đích danh Tuấn/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Xem tất cả hồi âm' })).toBeTruthy()
})

test('gõ một ký tự thì chưa lọc (máy chủ cũng không nhận), trang nhắc gõ thêm', async () => {
  giftRepository.listReplies.mockResolvedValue({ total: 0, items: [] })
  renderPage('/hoi-am?to=T')
  await waitFor(() => expect(giftRepository.listReplies).toHaveBeenCalledWith({ to: undefined, exact: false }))
  // Không tự nhận là đang lọc "gửi T"
  expect(await screen.findByText('0 hồi âm')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Xem tất cả hồi âm' })).toBeNull()

  fireEvent.change(screen.getByLabelText('Tên cậu:'), { target: { value: 'T' } })
  expect(screen.getByText('Gõ ít nhất 2 chữ nhé.')).toBeTruthy()
  // Dấu chấm hay emoji không tính là chữ: không gửi đi để rồi nhận lỗi 400
  fireEvent.change(screen.getByLabelText('Tên cậu:'), { target: { value: 'A.' } })
  expect(screen.getByText('Gõ ít nhất 2 chữ nhé.')).toBeTruthy()
})

test('hơn 300 hồi âm: đếm theo tổng (khớp trang chủ) và nói rõ chỉ hiện phần mới nhất', async () => {
  giftRepository.listReplies.mockResolvedValue({
    total: 320,
    items: [{ id: 1, content: 'Yêu cả lớp', created_at: '2026-10-20T00:10:00.000Z', from: { name: 'Hà' }, to: { kind: 'class' } }],
  })
  renderPage()
  expect(await screen.findByText('320 hồi âm · hiện 1 lá mới nhất')).toBeTruthy()
})

test('trang quà còn khoá thì hộp thư cũng chưa mở', async () => {
  giftRepository.listReplies.mockRejectedValue(Object.assign(new Error('Chưa đến ngày'), { status: 423 }))
  renderPage()
  expect(await screen.findByText('Hộp thư chưa mở')).toBeTruthy()
})
