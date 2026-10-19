import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import giftRepository from '../api/giftRepository'
import ReplyBox from './ReplyBox'

vi.mock('../api/giftRepository', () => ({ default: { createReply: vi.fn() } }))

beforeEach(() => {
  giftRepository.createReply.mockReset()
})
afterEach(cleanup)

test('viết hồi âm cho một lá thư: gửi đúng người nhận rồi báo lên trang', async () => {
  const onSent = vi.fn()
  const reply = { id: 9, target: 'letter', letter_id: 5, content: 'Cảm ơn Tuấn!', status: 'approved' }
  giftRepository.createReply.mockResolvedValue(reply)
  render(<ReplyBox accessCode="12a1-vy" target="letter" letterId={5} recipient="Tuấn" onSent={onSent} />)

  fireEvent.click(screen.getByRole('button', { name: '✉ Hồi âm' }))
  // Nói đúng phạm vi người đọc: Hộp thư hồi âm công khai cho cả khách
  expect(screen.getByText(/ai mở trang cũng đọc được, kể cả khách/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Gửi Tuấn:'), { target: { value: '  Cảm ơn Tuấn!  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi hồi âm ✉' }))

  await waitFor(() => expect(onSent).toHaveBeenCalledWith(reply))
  expect(giftRepository.createReply).toHaveBeenCalledWith('12a1-vy', {
    target: 'letter', letter_id: 5, content: 'Cảm ơn Tuấn!', is_anonymous: false,
  })
  // Gửi xong thì ô viết đóng lại, focus về nút mở ô viết và trình đọc màn hình được báo
  expect(screen.queryByRole('button', { name: 'Gửi hồi âm ✉' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '✉ Hồi âm' }))
  // Không cần duyệt: báo là đã lên Hộp thư, không nhắc chờ duyệt
  expect(screen.getByRole('status').textContent).toMatch(/Đã gửi hồi âm — giờ nó đã nằm ở Hộp thư hồi âm/)
  expect(screen.queryByText(/duyệt/)).toBeNull()
})

test('chọn "Gửi ẩn danh": gửi kèm cờ, ô viết nói rõ tên không hiện, hồi âm đã gửi ghi "ẩn danh"', async () => {
  const onSent = vi.fn()
  const reply = { id: 10, target: 'class', content: 'Cảm ơn các cậu', is_anonymous: true, status: 'approved' }
  giftRepository.createReply.mockResolvedValue(reply)
  render(<ReplyBox accessCode="12a1-vy" target="class" recipient="các bạn nam 12A1" onSent={onSent} />)

  fireEvent.click(screen.getByRole('button', { name: '✉ Hồi âm' }))
  expect(screen.queryByText(/tên cậu không hiện ở đâu cả/)).toBeNull()
  fireEvent.click(screen.getByLabelText('Gửi ẩn danh'))
  expect(screen.getByText(/tên cậu không hiện ở đâu cả/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Gửi các bạn nam 12A1:'), { target: { value: 'Cảm ơn các cậu' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi hồi âm ✉' }))

  await waitFor(() => expect(onSent).toHaveBeenCalledWith(reply))
  expect(giftRepository.createReply).toHaveBeenCalledWith('12a1-vy', {
    target: 'class', letter_id: undefined, content: 'Cảm ơn các cậu', is_anonymous: true,
  })
  // Lần viết sau bắt đầu lại có tên — ẩn danh là chọn cho từng lần gửi
  fireEvent.click(screen.getByRole('button', { name: '✉ Hồi âm' }))
  expect(screen.getByLabelText('Gửi ẩn danh').checked).toBe(false)

  cleanup()
  render(<ReplyBox accessCode="12a1-vy" target="class" recipient="các bạn nam 12A1" replies={[reply]} />)
  expect(screen.getByText('✉ Cậu đã hồi âm ẩn danh')).toBeTruthy()
})

test('bấm "Thôi" thì focus trở lại nút mở ô viết, không rơi về đầu trang', () => {
  render(<ReplyBox accessCode="12a1-vy" target="class" recipient="các bạn nam 12A1" openLabel="✉ Viết cho chúng tớ" />)
  fireEvent.click(screen.getByRole('button', { name: '✉ Viết cho chúng tớ' }))
  fireEvent.click(screen.getByRole('button', { name: 'Thôi' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '✉ Viết cho chúng tớ' }))
})

test('thư riêng gửi admin: trang quà chỉ báo đã gửi / đã đọc, không hiện lại nội dung', () => {
  render(
    <ReplyBox
      accessCode="12a1-vy"
      target="admin"
      recipient="admin"
      replies={[{ id: 1, target: 'admin', content: 'Bí mật nhỏ', status: 'pending' }]}
    />,
  )
  expect(screen.getByText('✉ Cậu đã gửi admin một lá thư riêng')).toBeTruthy()
  expect(screen.queryByText('Bí mật nhỏ')).toBeNull()
  cleanup()
  render(<ReplyBox accessCode="12a1-vy" target="admin" recipient="admin" replies={[{ id: 1, target: 'admin', content: null, status: 'approved' }]} />)
  expect(screen.getByText('✉ Admin đã đọc thư riêng của cậu')).toBeTruthy()
})

test('hồi âm gửi admin là thư riêng: ô viết nói rõ chỉ admin đọc', () => {
  render(<ReplyBox accessCode="12a1-vy" target="admin" recipient="admin" openLabel="✉ Hồi âm admin" />)
  fireEvent.click(screen.getByRole('button', { name: '✉ Hồi âm admin' }))
  expect(screen.getByText(/chỉ/).textContent).toMatch(/Thư riêng: chỉ admin đọc được/)
})

test('hồi âm gửi các bạn nam không gửi kèm lá thư; ô trống thì nhắc chứ không gọi máy chủ', async () => {
  giftRepository.createReply.mockRejectedValue(new Error('Cậu hồi âm nhiều quá rồi'))
  render(<ReplyBox accessCode="12a1-vy" target="class" letterId={5} recipient="các bạn nam 12A1" openLabel="✉ Viết cho chúng tớ" />)

  fireEvent.click(screen.getByRole('button', { name: '✉ Viết cho chúng tớ' }))
  fireEvent.click(screen.getByRole('button', { name: 'Gửi hồi âm ✉' }))
  expect(screen.getByRole('alert').textContent).toMatch(/Viết vài chữ/)
  expect(giftRepository.createReply).not.toHaveBeenCalled()

  fireEvent.change(screen.getByLabelText('Gửi các bạn nam 12A1:'), { target: { value: 'Cảm ơn các cậu' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi hồi âm ✉' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/nhiều quá/))
  expect(giftRepository.createReply).toHaveBeenCalledWith('12a1-vy', {
    target: 'class', letter_id: undefined, content: 'Cảm ơn các cậu', is_anonymous: false,
  })
})

test('hồi âm đã gửi hiện lại kèm trạng thái, nút đổi thành "Viết thêm"', () => {
  render(
    <ReplyBox
      accessCode="12a1-vy"
      target="admin"
      recipient="admin"
      replies={[
        { id: 1, content: 'Cảm ơn admin', status: 'pending' },
        { id: 2, content: 'Đã được duyệt', status: 'approved' },
      ]}
    />,
  )
  expect(screen.getByText('✉ Cậu đã hồi âm · chờ duyệt')).toBeTruthy()
  expect(screen.getByText('✉ Cậu đã hồi âm')).toBeTruthy()
  expect(screen.getByRole('button', { name: '✉ Viết thêm' })).toBeTruthy()
})
