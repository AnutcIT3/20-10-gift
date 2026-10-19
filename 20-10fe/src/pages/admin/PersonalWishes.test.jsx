import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { adminApi } from '../../api/adminApi'
import PersonalWishes from './PersonalWishes'

vi.mock('../../api/adminApi', () => ({
  adminApi: {
    updateStudent: vi.fn(),
    addWishImages: vi.fn(),
    removeWishImage: vi.fn(),
    clearWishImages: vi.fn(),
    addWishNote: vi.fn(),
    updateWishNote: vi.fn(),
    removeWishNote: vi.fn(),
    addWishNoteImages: vi.fn(),
    removeWishNoteImage: vi.fn(),
    previewGreeting: vi.fn(),
  },
}))

afterEach(cleanup)

const IMAGE = 'https://res.cloudinary.com/demo/image/upload/v1/gift_20_10/w.jpg'
const STUDENTS = [
  {
    id: 10, full_name: 'Thủy', nickname: 'Thủy Phin', member_type: 'class', is_active: true,
    intro_message: 'Thủy là cô gái nhí nhảnh', admin_wish: null, intro_image_url: IMAGE,
    intro_images: [{ id: 5, url: IMAGE }, { id: 6, url: `${IMAGE}?2` }],
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
  adminApi.addWishImages.mockImplementation(async (id, kind, files) => ({ id, [`${kind}_images`]: files.map((_, n) => ({ id: n + 1, url: IMAGE })) }))
  adminApi.removeWishImage.mockImplementation(async (id, kind) => ({ id, [`${kind}_images`]: [] }))
  adminApi.clearWishImages.mockImplementation(async (id, kind) => ({ id, [`${kind}_images`]: [] }))
  adminApi.previewGreeting.mockResolvedValue({ greeting: 'Gửi quyeniuu — người bạn thân của tụi tớ!' })
})

const card = (name) => screen.getByRole('article', { name: `Lời chúc riêng của ${name}` })

test('mỗi bạn một thẻ với ba lời chúc riêng; thành viên lớp trước, khách sau', () => {
  render(<PersonalWishes students={STUDENTS} onStudentSaved={vi.fn()} />)
  const names = screen.getAllByRole('article').map((article) => article.getAttribute('aria-label'))
  expect(names).toEqual(['Lời chúc riêng của Thủy', 'Lời chúc riêng của Trần Hoàng Quyên', 'Lời chúc riêng của Minh Thư'])
  const thuy = within(card('Thủy'))
  expect(thuy.getByLabelText('Lời chúc riêng của Thủy')).toHaveValue('Thủy là cô gái nhí nhảnh')
  expect(thuy.getAllByRole('img', { name: /kèm lời chúc riêng/ })).toHaveLength(2)
  expect(thuy.getByRole('button', { name: /Thêm ảnh \(2\/4\)/ })).toBeEnabled()
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

  // Chọn một lúc nhiều ảnh
  const photos = ['hoa', 'la'].map((name) => new File(['x'], `${name}.jpg`, { type: 'image/jpeg' }))
  fireEvent.change(thuy.getByLabelText('Ảnh kèm ✨ lời chúc tự động của Thủy'), { target: { files: photos } })
  await waitFor(() => expect(adminApi.addWishImages).toHaveBeenCalledWith(10, 'greeting', photos))

  // Bỏ riêng một ảnh, hay bỏ hết
  const intro = within(thuy.getByRole('region', { name: 'Lời chúc riêng — Thủy' }))
  fireEvent.click(intro.getByRole('button', { name: 'Bỏ ảnh 2' }))
  await waitFor(() => expect(adminApi.removeWishImage).toHaveBeenCalledWith(10, 'intro', 6))
  fireEvent.click(intro.getByRole('button', { name: 'Bỏ hết ảnh' }))
  await waitFor(() => expect(adminApi.clearWishImages).toHaveBeenCalledWith(10, 'intro'))
})

test('ảnh sai định dạng bị chặn trước khi gửi; xem thử lời chúc tự động đúng kiểu của bạn đó', async () => {
  render(<PersonalWishes students={STUDENTS} onStudentSaved={vi.fn()} />)
  const quyen = within(card('Trần Hoàng Quyên'))
  fireEvent.change(quyen.getByLabelText('Ảnh kèm lời chúc riêng của Trần Hoàng Quyên'), {
    target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
  })
  expect(quyen.getByRole('alert')).toHaveTextContent('Ảnh phải là JPG, PNG, GIF hoặc WebP.')
  // Đã có 2 ảnh: chọn thêm 3 là quá 4 → chặn, không tải gì
  const thuy = within(card('Thủy'))
  fireEvent.change(thuy.getByLabelText('Ảnh kèm lời chúc riêng của Thủy'), {
    target: { files: ['a', 'b', 'c'].map((name) => new File(['x'], `${name}.jpg`, { type: 'image/jpeg' })) },
  })
  expect(thuy.getByRole('alert')).toHaveTextContent('chỉ thêm được 2 ảnh nữa')
  expect(adminApi.addWishImages).not.toHaveBeenCalled()

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

test('lời chúc riêng và 💌 thêm được tới 4 lời; mỗi lời sửa, xoá và kèm ảnh riêng', async () => {
  const onStudentSaved = vi.fn()
  const notes = [
    { id: 21, content: 'Lời hai', images: [{ id: 31, url: IMAGE }] },
    { id: 22, content: 'Lời ba', images: [] },
  ]
  adminApi.addWishNote.mockResolvedValue({ id: 10 })
  adminApi.updateWishNote.mockResolvedValue({ id: 10 })
  adminApi.removeWishNote.mockResolvedValue({ id: 10 })
  adminApi.addWishNoteImages.mockResolvedValue({ id: 10 })
  adminApi.removeWishNoteImage.mockResolvedValue({ id: 10 })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PersonalWishes students={[{ ...STUDENTS[0], admin_wish: 'Lời một', admin_wish_notes: notes }]} onStudentSaved={onStudentSaved} />)
  const admin = within(screen.getByRole('region', { name: '💌 Lời chúc từ admin — Thủy' }))

  // Đã có 3 lời → còn chỗ cho 1
  fireEvent.click(admin.getByRole('button', { name: '+ Thêm lời nhắn (3/4)' }))
  fireEvent.change(admin.getByRole('textbox', { name: '💌 Lời chúc từ admin — lời mới của Thủy' }), { target: { value: '  Lời bốn  ' } })
  fireEvent.click(admin.getByRole('button', { name: 'Lưu lời nhắn' }))
  await waitFor(() => expect(adminApi.addWishNote).toHaveBeenCalledWith(10, 'admin_wish', 'Lời bốn'))

  const second = within(admin.getByRole('group', { name: '💌 Lời chúc từ admin — lời 2 của Thủy' }))
  fireEvent.change(second.getByRole('textbox', { name: '💌 Lời chúc từ admin — lời 2 của Thủy' }), { target: { value: 'Lời hai đã sửa' } })
  fireEvent.click(second.getByRole('button', { name: 'Lưu chữ' }))
  await waitFor(() => expect(adminApi.updateWishNote).toHaveBeenCalledWith(10, 21, 'Lời hai đã sửa'))

  fireEvent.click(second.getByRole('button', { name: 'Bỏ ảnh 1' }))
  await waitFor(() => expect(adminApi.removeWishNoteImage).toHaveBeenCalledWith(10, 21, 31))

  const third = within(admin.getByRole('group', { name: '💌 Lời chúc từ admin — lời 3 của Thủy' }))
  const photos = ['a', 'b'].map((name) => new File(['x'], `${name}.jpg`, { type: 'image/jpeg' }))
  fireEvent.change(third.getByLabelText('Ảnh kèm 💌 Lời chúc từ admin — lời 3 của Thủy'), { target: { files: photos } })
  await waitFor(() => expect(adminApi.addWishNoteImages).toHaveBeenCalledWith(10, 22, photos))

  fireEvent.click(third.getByRole('button', { name: 'Xoá lời này' }))
  await waitFor(() => expect(adminApi.removeWishNote).toHaveBeenCalledWith(10, 22))
})

test('đủ 4 lời thì không thêm được nữa; ✨ lời chúc tự động không có lời nhắn thêm', () => {
  const full = [{ id: 1, content: 'a', images: [] }, { id: 2, content: 'b', images: [] }, { id: 3, content: 'c', images: [] }]
  render(<PersonalWishes students={[{ ...STUDENTS[0], intro_notes: full }]} onStudentSaved={vi.fn()} />)
  const intro = within(screen.getByRole('region', { name: 'Lời chúc riêng — Thủy' }))
  expect(intro.getByRole('button', { name: 'Đủ 4 lời nhắn' })).toBeDisabled()
  const auto = within(screen.getByRole('region', { name: '✨ Lời chúc tự động — Thủy' }))
  expect(auto.queryByRole('button', { name: /Thêm lời nhắn/ })).toBeNull()
})
