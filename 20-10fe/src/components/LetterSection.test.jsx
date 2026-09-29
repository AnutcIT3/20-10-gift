import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import LetterSection from './LetterSection'

vi.mock('../services/api', () => ({ default: { post: vi.fn() } }))

afterEach(cleanup)

const letter = (id, senderKind, senderName) => ({
  id,
  sender_kind: senderKind,
  sender_name: senderName,
  is_anonymous: false,
  content: `Lời chúc ${id}`,
  created_at: '2026-10-20T01:00:00.000Z',
})

test('chỉ có thư của khách thì giữ một danh sách liền như trước', () => {
  render(<LetterSection letters={[letter(1, 'guest', 'Lan'), letter(2, 'guest', 'Mai')]} accessCode="12a1-thuy" />)
  expect(screen.getByText('2 bức thư')).toBeTruthy()
  expect(screen.queryByText('Từ khách ghé thăm')).toBeNull()
  expect(screen.queryByText('Từ các bạn nam 12A1')).toBeNull()
})

test('có thư của các bạn nam thì tách hai nhóm, nhóm các bạn nam lên trước', () => {
  render(<LetterSection
    letters={[letter(1, 'guest', 'Khách'), letter(2, 'classmate', 'Tuấn'), letter(3, 'classmate', 'Hùng')]}
    accessCode="12a1-thuy"
  />)
  const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)
  expect(headings).toEqual(['Từ các bạn nam 12A1', 'Từ khách ghé thăm'])
  expect(screen.getByText('3 bức thư')).toBeTruthy()
})

test('thư cũ chưa có nhóm được xếp vào khách', () => {
  render(<LetterSection letters={[{ ...letter(1, undefined, 'Cũ') }, letter(2, 'classmate', 'Tuấn')]} accessCode="12a1-thuy" />)
  const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)
  expect(headings).toEqual(['Từ các bạn nam 12A1', 'Từ khách ghé thăm'])
})

test('hộp thư trống thì không hiện tiêu đề nhóm nào', () => {
  render(<LetterSection letters={[]} accessCode="12a1-thuy" />)
  expect(screen.getByText('hộp thư còn trống')).toBeTruthy()
  expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
})

test('trang quà cho hồi âm thì mỗi lá thư có nút "Hồi âm", hồi âm đã gửi hiện đúng dưới thư của nó', () => {
  render(<LetterSection
    letters={[letter(1, 'classmate', 'Tuấn'), letter(2, 'guest', 'Lan')]}
    accessCode="12a1-thuy"
    replies={[{ id: 7, target: 'letter', letter_id: 2, content: 'Cảm ơn Lan!', status: 'pending' }]}
    onReplied={() => {}}
  />)
  expect(screen.getAllByRole('button', { name: '✉ Hồi âm' })).toHaveLength(1)
  expect(screen.getByRole('button', { name: '✉ Viết thêm' })).toBeTruthy()
  expect(screen.getByText('Cảm ơn Lan!')).toBeTruthy()
})

test('không truyền onReplied thì không có nút hồi âm nào', () => {
  render(<LetterSection letters={[letter(1, 'guest', 'Lan')]} accessCode="12a1-thuy" />)
  expect(screen.queryByRole('button', { name: '✉ Hồi âm' })).toBeNull()
})
