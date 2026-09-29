import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { adminApi } from '../../api/adminApi'
import StudentManager from './StudentManager'

vi.mock('../../api/adminApi', () => ({
  adminApi: {
    listStudents: vi.fn(),
    updateStudent: vi.fn(),
    createStudent: vi.fn(),
  },
}))

afterEach(cleanup)

const student = (id, full_name, member_type, extra = {}) => ({
  id, full_name, member_type, is_active: true, class_name: '12A1', giftPath: `/gift/code-${id}`,
  avatar_url: 'https://res.cloudinary.com/demo/a.jpg', gallery_count: 2, ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  adminApi.listStudents.mockResolvedValue([
    student(3, 'Phương Anh', 'class'),
    student(4, 'Thanh Huyền', 'class', { avatar_url: null }),
    student(26, 'an', 'test', { avatar_url: null, gallery_count: 0 }),
    student(40, 'Minh Thư', 'friend', { avatar_url: null, gallery_count: 0 }),
  ])
  adminApi.updateStudent.mockResolvedValue({})
})

const renderPage = () => render(<MemoryRouter><StudentManager /></MemoryRouter>)

test('sĩ số chỉ đếm thành viên lớp; tài khoản thử đứng riêng và không bị nhắc thiếu ảnh', async () => {
  renderPage()
  const heading = await screen.findByRole('heading', { name: /Danh sách lớp/ })
  expect(heading).toHaveTextContent('Danh sách lớp · 2 bạn · 1 tài khoản thử · 1 chưa có ảnh đại diện')
  expect(screen.getByText('tài khoản thử · không tính vào lớp')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Tài khoản thử' }))
  const rows = screen.getAllByRole('row').slice(1)
  expect(rows).toHaveLength(1)
  expect(within(rows[0]).getByText('an')).toBeInTheDocument()

  // Bạn ngoài lớp và tài khoản thử không cần ảnh đại diện
  fireEvent.click(screen.getByRole('button', { name: 'Chưa có ảnh đại diện' }))
  const missing = screen.getAllByRole('row').slice(1)
  expect(missing).toHaveLength(1)
  expect(within(missing[0]).getByText('Thanh Huyền')).toBeInTheDocument()
})

test('admin chuyển tài khoản thử về thành viên lớp ngay trong khung sửa', async () => {
  renderPage()
  await screen.findByText('an')
  const row = screen.getByText('an').closest('[role="row"]')
  fireEvent.click(within(row).getByRole('button', { name: 'Thao tác khác' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sửa thông tin' }))

  const type = screen.getByLabelText('Loại')
  expect(type).toHaveValue('test')
  fireEvent.change(type, { target: { value: 'class' } })
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))

  await waitFor(() => expect(adminApi.updateStudent).toHaveBeenCalledTimes(1))
  expect(adminApi.updateStudent.mock.calls[0][0]).toBe(26)
  expect(adminApi.updateStudent.mock.calls[0][1]).toMatchObject({ member_type: 'class' })
})

test('hồ sơ bạn ngoài lớp không có ô chọn loại và không gửi member_type', async () => {
  renderPage()
  await screen.findByText('Minh Thư')
  const row = screen.getByText('Minh Thư').closest('[role="row"]')
  fireEvent.click(within(row).getByRole('button', { name: 'Thao tác khác' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sửa thông tin' }))

  expect(screen.queryByLabelText('Loại')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
  await waitFor(() => expect(adminApi.updateStudent).toHaveBeenCalledTimes(1))
  expect(adminApi.updateStudent.mock.calls[0][1]).not.toHaveProperty('member_type')
})
