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

test('admin chọn một lúc nhiều ảnh (tối đa 4) cho lời chúc gửi nhiều người, đủ ảnh đi cùng lần gửi', async () => {
  await openComposeWithTwoRecipients()
  const photos = ['a', 'b', 'c'].map((name) => new File(['x'], `${name}.jpg`, { type: 'image/jpeg' }))
  fireEvent.change(screen.getByLabelText('Ảnh kèm lời chúc'), { target: { files: photos } })

  expect(screen.getByText(/3 ảnh · dùng chung cho 2 người nhận/)).toBeInTheDocument()
  expect(screen.getAllByRole('img', { name: /sẽ gửi kèm/ })).toHaveLength(3)
  expect(screen.getByRole('button', { name: /Thêm ảnh \(3\/4\)/ })).toBeEnabled()

  // Chọn thêm 2 ảnh khi chỉ còn chỗ cho 1: lấy 1, báo đã đủ 4
  const more = ['d', 'e'].map((name) => new File(['x'], `${name}.jpg`, { type: 'image/jpeg' }))
  fireEvent.change(screen.getByLabelText('Ảnh kèm lời chúc'), { target: { files: more } })
  expect(screen.getByRole('alert')).toHaveTextContent('tối đa 4 ảnh')
  expect(screen.getAllByRole('img', { name: /sẽ gửi kèm/ })).toHaveLength(4)
  expect(screen.getByRole('button', { name: /Đủ 4 ảnh/ })).toBeDisabled()

  // Bỏ riêng ảnh thứ hai
  fireEvent.click(screen.getByRole('button', { name: 'Bỏ ảnh 2' }))
  expect(screen.getAllByRole('img', { name: /sẽ gửi kèm/ })).toHaveLength(3)

  fireEvent.click(screen.getByRole('button', { name: 'Dán tem & gửi ✉' }))
  await waitFor(() => expect(adminApi.createLetters).toHaveBeenCalledTimes(1))
  const [payload, images] = adminApi.createLetters.mock.calls[0]
  expect(payload.student_ids).toEqual([9, 10])
  expect(payload.content).toBe('Chúc mừng 20/10!')
  expect(images).toEqual([photos[0], photos[2], more[0]])
  expect(await screen.findByText('Đã gửi lời chúc kèm 3 ảnh cho 2 người nhận.')).toBeInTheDocument()
})

test('ảnh sai định dạng hay quá 5 MB bị chặn trước khi gửi; bỏ hết ảnh thì gửi chữ như cũ', async () => {
  await openComposeWithTwoRecipients()
  const input = screen.getByLabelText('Ảnh kèm lời chúc')

  fireEvent.change(input, { target: { files: [new File(['x'], 'ghi-chu.pdf', { type: 'application/pdf' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('Ảnh phải là JPG, PNG, GIF hoặc WebP, tối đa 5 MB.')

  const big = new File(['x'], 'to.jpg', { type: 'image/jpeg' })
  Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
  // Lẫn một ảnh hỏng trong nhiều ảnh: ảnh tốt vẫn được lấy
  fireEvent.change(input, { target: { files: [big, new File(['x'], 'hoa.png', { type: 'image/png' })] } })
  expect(screen.getByRole('alert')).toHaveTextContent('đã bỏ qua')
  expect(screen.getAllByRole('img', { name: /sẽ gửi kèm/ })).toHaveLength(1)

  fireEvent.change(input, { target: { files: [new File(['x'], 'la.png', { type: 'image/png' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Bỏ hết ảnh' }))
  expect(screen.queryByRole('img', { name: /sẽ gửi kèm/ })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Dán tem & gửi ✉' }))
  await waitFor(() => expect(adminApi.createLetters).toHaveBeenCalledTimes(1))
  expect(adminApi.createLetters.mock.calls[0][1]).toEqual([])
  expect(await screen.findByText('Đã gửi lời chúc cho 2 người nhận.')).toBeInTheDocument()
})

test('hộp thư hiện đủ ảnh của từng lời chúc và đếm số ảnh', async () => {
  adminApi.listLetters.mockResolvedValue({
    items: [{
      id: 1, student_name: 'Thủy', sender_name: 'An', content: 'Chúc mừng', status: 'pending',
      created_at: '2026-10-17T01:00:00Z', image_url: 'https://x/1.jpg',
      images: [{ id: 1, url: 'https://x/1.jpg' }, { id: 2, url: 'https://x/2.jpg' }],
    }],
    pagination: { total: 1, totalPages: 1 },
  })
  renderPage()
  expect(await screen.findByText('📷 2 ảnh')).toBeInTheDocument()
  expect(screen.getAllByRole('img', { name: /Ảnh kèm lời chúc \d/ })).toHaveLength(2)
})

test('tab "Riêng từng bạn" quản lý ba lời chúc riêng của từng bạn, không tải danh sách thư', async () => {
  render(<MemoryRouter initialEntries={['/admin/letters?status=personal']}><LetterManager /></MemoryRouter>)
  expect(await screen.findByRole('article', { name: 'Lời chúc riêng của Thủy' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Riêng từng bạn' })).toHaveAttribute('aria-pressed', 'true')
  expect(adminApi.listLetters).not.toHaveBeenCalled()
  // Khung soạn thư và danh sách thư không hiện ở tab này
  expect(screen.queryByRole('button', { name: '✍ Soạn lời chúc' })).toBeNull()
})
