import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { adminApi } from '../../api/adminApi'
import PersonalWishes from './PersonalWishes'

vi.mock('../../api/adminApi', () => ({
  adminApi: {
    updateStudent: vi.fn(),
    setWishImage: vi.fn(),
    clearWishImage: vi.fn(),
    previewGreeting: vi.fn(),
  },
}))

afterEach(cleanup)

const IMAGE = 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/w.jpg'
const STUDENTS = [
  {
    id: 10, full_name: 'Thủy', nickname: 'Thủy Phin', member_type: 'class', is_active: true,
    intro_message: 'Thủy là cô gái nhí nhảnh', admin_wish: null, intro_image_url: IMAGE,
  },
  {
    id: 29, full_name: 'Trần Hoàng Quyên', nickname: 'quyeniuu', member_type: 'friend', is_active: true,
    face_profile_count: 1,
  },
  { id: 40, full_name: 'Minh Thư', nickname: null, member_type: 'friend', is_active: true, face_profile_count: 0 },
]

beforeEach(() => {
  vi.clearAllMocks()
  adminApi.updateStudent.mockImplementation(async (id, data) => ({ id, ...data }))
  adminApi.setWishImage.mockImplementation(async (id, kind) => ({ id, [`${kind}_image_url`]: IMAGE }))
  adminApi.clearWishImage.mockImplementation(async (id, kind) => ({ id, [`${kind}_image_url`]: null }))
  adminApi.previewGreeting.mockResolvedValue({ greeting: 'Gửi quyeniuu — người bạn thân của tụi tớ!' })
})

const card = (name) => screen.getByRole('article', { name: `Lời chúc riêng của ${name}` })

test('mỗi bạn một thẻ với ba lời chúc riêng; thành viên lớp trước, khách sau', () => {
  render(<PersonalWishes students={STUDENTS} onStudentSaved={vi.fn()} />)
  const names = screen.getAllByRole('article').map((article) => article.getAttribute('aria-label'))
  expect(names).toEqual(['Lời chúc riêng của Thủy', 'Lời chúc riêng của Trần Hoàng Quyên', 'Lời chúc riêng của Minh Thư'])
  const thuy = within(card('Thủy'))
  expect(thuy.getByLabelText('Lời chúc riêng của Thủy')).toHaveValue('Thủy là cô gái nhí nhảnh')
  expect(thuy.getByRole('img', { name: 'Ảnh kèm lời chúc riêng' })).toBeTruthy()
  expect(thuy.getByText(/máy tự viết khi trang quà mở/)).toHaveTextContent('bạn trong lớp')
  // Khách có Face ID là bạn thân, khách thường giữ lời chúc lịch sự
  expect(within(card('Trần Hoàng Quyên')).getByText(/máy tự viết khi trang quà mở/)).toHaveTextContent('bạn thân')
  expect(within(card('Minh Thư')).getByText(/máy tự viết khi trang quà mở/)).toHaveTextContent('khách ghé thăm')
})

test('sửa chữ 💌 rồi lưu; thêm ảnh và bỏ ảnh của từng loại lời chúc', async () => {
  const onStudentSaved = vi.fn()
  render(<PersonalWishes students={STUDENTS} onStudentSaved={onStudentSaved} />)
  const thuy = within(card('Thủy'))

  fireEvent.change(thuy.getByLabelText('💌 Lời chúc từ admin của Thủy'), { target: { value: '  Chúc Thủy vui!  ' } })
  const admin = within(thuy.getByRole('region', { name: '💌 Lời chúc từ admin — Thủy' }))
  fireEvent.click(admin.getByRole('button', { name: 'Lưu chữ' }))
  await waitFor(() => expect(adminApi.updateStudent).toHaveBeenCalledWith(10, { admin_wish: 'Chúc Thủy vui!' }))
  expect(onStudentSaved).toHaveBeenCalledWith({ id: 10, admin_wish: 'Chúc Thủy vui!' })

  const photo = new File(['x'], 'hoa.jpg', { type: 'image/jpeg' })
  fireEvent.change(thuy.getByLabelText('Ảnh kèm ✨ lời chúc tự động của Thủy'), { target: { files: [photo] } })
  await waitFor(() => expect(adminApi.setWishImage).toHaveBeenCalledWith(10, 'greeting', photo))

  const intro = within(thuy.getByRole('region', { name: 'Lời chúc riêng — Thủy' }))
  fireEvent.click(intro.getByRole('button', { name: 'Bỏ ảnh' }))
  await waitFor(() => expect(adminApi.clearWishImage).toHaveBeenCalledWith(10, 'intro'))
})

test('ảnh sai định dạng bị chặn trước khi gửi; xem thử lời chúc tự động đúng kiểu của bạn đó', async () => {
  render(<PersonalWishes students={STUDENTS} onStudentSaved={vi.fn()} />)
  const quyen = within(card('Trần Hoàng Quyên'))
  fireEvent.change(quyen.getByLabelText('Ảnh kèm lời chúc riêng của Trần Hoàng Quyên'), {
    target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
  })
  expect(quyen.getByRole('alert')).toHaveTextContent('Ảnh phải là JPG, PNG, GIF hoặc WebP.')
  expect(adminApi.setWishImage).not.toHaveBeenCalled()

  fireEvent.click(quyen.getByRole('button', { name: 'Xem thử' }))
  expect(await quyen.findByText('Gửi quyeniuu — người bạn thân của tụi tớ!')).toBeTruthy()
  expect(adminApi.previewGreeting).toHaveBeenCalledWith('quyeniuu', 'close_friend')
})

test('admin sửa được lời chúc tự động: chép câu máy viết thử vào ô, sửa rồi lưu; để trống thì máy tự viết lại', async () => {
  const onStudentSaved = vi.fn()
  adminApi.previewGreeting.mockResolvedValue({ greeting: 'Chúc Thủy một ngày 20/10 thật vui!' })
  render(<PersonalWishes students={STUDENTS} onStudentSaved={onStudentSaved} />)
  const thuy = within(card('Thủy'))
  const box = thuy.getByLabelText('✨ Lời chúc tự động của Thủy')
  expect(box).toHaveAttribute('placeholder', 'Để trống thì máy tự viết')

  fireEvent.click(thuy.getByRole('button', { name: 'Xem thử' }))
  fireEvent.click(await thuy.findByRole('button', { name: 'Dùng câu này để sửa' }))
  expect(box).toHaveValue('Chúc Thủy một ngày 20/10 thật vui!')
  fireEvent.change(box, { target: { value: 'Chúc Thủy Phin 20/10 rực rỡ nhé!' } })
  const auto = within(thuy.getByRole('region', { name: '✨ Lời chúc tự động — Thủy' }))
  fireEvent.click(auto.getByRole('button', { name: 'Lưu chữ' }))
  await waitFor(() => expect(adminApi.updateStudent).toHaveBeenCalledWith(10, { greeting_custom: 'Chúc Thủy Phin 20/10 rực rỡ nhé!' }))
})

test('đã có câu admin viết thì báo trang quà đang dùng câu đó', () => {
  render(<PersonalWishes students={[{ ...STUDENTS[0], greeting_custom: 'Câu admin viết' }]} onStudentSaved={vi.fn()} />)
  const thuy = within(card('Thủy'))
  expect(thuy.getByLabelText('✨ Lời chúc tự động của Thủy')).toHaveValue('Câu admin viết')
  expect(thuy.getByText(/Trang quà đang dùng/)).toHaveTextContent('câu admin viết')
})
