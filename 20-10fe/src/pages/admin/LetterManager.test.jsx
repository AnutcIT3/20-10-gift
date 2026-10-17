import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { adminApi } from '../../api/adminApi'
import LetterManager from './LetterManager'

vi.mock('../../api/adminApi', () => ({
  adminApi: {
    listStudents: vi.fn(),
    listLetters: vi.fn(),
    getStats: vi.fn(),
    createLetters: vi.fn(),
  },
}))

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom không có URL.createObjectURL — ảnh xem trước chỉ cần một chuỗi
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  adminApi.listStudents.mockResolvedValue([
    { id: 9, full_name: 'Thúy', is_active: true },
    { id: 10, full_name: 'Thủy', is_active: true },
  ])
  adminApi.listLetters.mockResolvedValue({ items: [], pagination: { total: 0, totalPages: 0 } })
  adminApi.getStats.mockResolvedValue(null)
  adminApi.createLetters.mockResolvedValue({ created: 2 })
})

const renderPage = () => render(<MemoryRouter initialEntries={['/admin/letters']}><LetterManager /></MemoryRouter>)

async function openComposeWithTwoRecipients() {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: '✍ Soạn lời chúc' }))
  // Tên còn nằm ở bộ lọc người nhận phía trên, nên có hơn một chỗ
  await screen.findAllByText('Thủy')
  fireEvent.click(screen.getByRole('button', { name: 'Chọn tất cả người đang hoạt động' }))
  fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'Chúc mừng 20/10!' } })
}

test('admin kèm một ảnh vào lời chúc gửi nhiều người, ảnh đi cùng lần gửi', async () => {
  await openComposeWithTwoRecipients()
  const photo = new File(['x'], 'hoa.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText('Ảnh kèm lời chúc'), { target: { files: [photo] } })

  expect(screen.getByText('hoa.jpg · dùng chung cho 2 người nhận')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Ảnh sẽ gửi kèm' })).toHaveAttribute('src', 'blob:preview')

  fireEvent.click(screen.getByRole('button', { name: 'Dán tem & gửi ✉' }))
  await waitFor(() => expect(adminApi.createLetters).toHaveBeenCalledTimes(1))
  const [payload, image] = adminApi.createLetters.mock.calls[0]
  expect(payload.student_ids).toEqual([9, 10])
  expect(payload.content).toBe('Chúc mừng 20/10!')
  expect(image).toBe(photo)
  expect(await screen.findByText('Đã gửi lời chúc kèm ảnh cho 2 người nhận.')).toBeInTheDocument()
})

test('ảnh sai định dạng hay quá 5 MB bị chặn trước khi gửi; bỏ ảnh thì gửi chữ như cũ', async () => {
  await openComposeWithTwoRecipients()
  const input = screen.getByLabelText('Ảnh kèm lời chúc')

  fireEvent.change(input, { target: { files: [new File(['x'], 'ghi-chu.pdf', { type: 'application/pdf' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('Ảnh phải là JPG, PNG, GIF hoặc WebP.')

  const big = new File(['x'], 'to.jpg', { type: 'image/jpeg' })
  Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
  fireEvent.change(input, { target: { files: [big] } })
  expect(screen.getByRole('alert')).toHaveTextContent('Ảnh tối đa 5 MB.')

  fireEvent.change(input, { target: { files: [new File(['x'], 'hoa.png', { type: 'image/png' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Bỏ ảnh' }))
  expect(screen.queryByRole('img', { name: 'Ảnh sẽ gửi kèm' })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Dán tem & gửi ✉' }))
  await waitFor(() => expect(adminApi.createLetters).toHaveBeenCalledTimes(1))
  expect(adminApi.createLetters.mock.calls[0][1]).toBeNull()
  expect(await screen.findByText('Đã gửi lời chúc cho 2 người nhận.')).toBeInTheDocument()
})

test('tab "Riêng từng bạn" quản lý ba lời chúc riêng của từng bạn, không tải danh sách thư', async () => {
  render(<MemoryRouter initialEntries={['/admin/letters?status=personal']}><LetterManager /></MemoryRouter>)
  expect(await screen.findByRole('article', { name: 'Lời chúc riêng của Thủy' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Riêng từng bạn' })).toHaveAttribute('aria-pressed', 'true')
  expect(adminApi.listLetters).not.toHaveBeenCalled()
  // Khung soạn thư và danh sách thư không hiện ở tab này
  expect(screen.queryByRole('button', { name: '✍ Soạn lời chúc' })).toBeNull()
})
