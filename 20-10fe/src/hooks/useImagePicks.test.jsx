import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import useImagePicks from './useImagePicks'
import { letterImageUrls, wishImageUrls } from '../lib/images'

beforeEach(() => {
  let n = 0
  URL.createObjectURL = vi.fn(() => { n += 1; return `blob:${n}` })
  URL.revokeObjectURL = vi.fn()
})

const jpg = (name) => new File(['x'], `${name}.jpg`, { type: 'image/jpeg' })

test('chọn nhiều ảnh một lúc, thêm dần, không quá 4 ảnh', () => {
  const { result } = renderHook(() => useImagePicks())
  let message
  act(() => { message = result.current.add([jpg('a'), jpg('b'), jpg('c')]) })
  expect(message).toBe('')
  expect(result.current.files.map((file) => file.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  expect(result.current.remaining).toBe(1)

  act(() => { message = result.current.add([jpg('d'), jpg('e')]) })
  expect(message).toMatch(/tối đa 4 ảnh/)
  expect(result.current.files.map((file) => file.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
  expect(result.current.full).toBe(true)
})

test('bỏ từng ảnh hay bỏ hết đều trả lại link xem trước', () => {
  const { result } = renderHook(() => useImagePicks())
  act(() => { result.current.add([jpg('a'), jpg('b')]) })
  const [first] = result.current.picks
  act(() => result.current.remove(first.id))
  expect(result.current.files.map((file) => file.name)).toEqual(['b.jpg'])
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(first.preview)
  act(() => result.current.clear())
  expect(result.current.picks).toEqual([])
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})

test('ảnh sai định dạng hay quá 5 MB bị bỏ qua, ảnh tốt vẫn được lấy', () => {
  const { result } = renderHook(() => useImagePicks())
  const big = jpg('to')
  Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
  let message
  act(() => { message = result.current.add([big, new File(['x'], 'a.pdf', { type: 'application/pdf' }), jpg('ok')]) })
  expect(message).toMatch(/đã bỏ qua/)
  expect(result.current.files.map((file) => file.name)).toEqual(['ok.jpg'])
})

test('đọc được cả ảnh mới (nhiều ảnh) lẫn cột ảnh cũ của máy chủ chưa cập nhật', () => {
  expect(letterImageUrls({ images: [{ id: 1, url: 'a' }, { id: 2, url: 'b' }], image_url: 'a' })).toEqual(['a', 'b'])
  expect(letterImageUrls({ image_url: 'old' })).toEqual(['old'])
  expect(letterImageUrls({ image_url: null })).toEqual([])
  expect(wishImageUrls({ admin_wish_images: [{ id: 3, url: 'w' }] }, 'admin_wish')).toEqual(['w'])
  expect(wishImageUrls({ greeting_image_url: 'g' }, 'greeting')).toEqual(['g'])
  expect(wishImageUrls({}, 'intro')).toEqual([])
})
