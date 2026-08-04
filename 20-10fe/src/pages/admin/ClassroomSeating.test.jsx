import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { adminApi } from '../../api/adminApi'
import ClassroomSeating from './ClassroomSeating'

vi.mock('../../api/adminApi', () => ({
  adminApi: {
    listStudents: vi.fn(),
    updateStudentSeat: vi.fn(),
  },
}))

beforeEach(() => {
  adminApi.listStudents.mockResolvedValue([
    { id: 17, full_name: 'Phượng', nickname: 'Phượng', class_name: '12A1', is_active: true, seat_row: 0, seat_col: 9 },
    { id: 22, full_name: 'Hương', nickname: 'Hương', class_name: '12A1', is_active: true, seat_row: 5, seat_col: 3 },
  ])
})

test('renders the persisted classroom positions returned by the admin API', async () => {
  render(<ClassroomSeating />)

  expect(await screen.findByRole('heading', { name: 'Sơ đồ lớp' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Phượng (12A1)' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Hương (12A1)' })).toBeInTheDocument()
  expect(screen.getByLabelText('Thống kê sơ đồ lớp')).toHaveTextContent('2 ghế đã xếp')
})
