import { useCallback, useEffect, useRef, useState } from 'react'

// Một lời chúc kèm tối đa 4 ảnh — khớp giới hạn ở máy chủ
export const MAX_WISH_IMAGES = 4
export const WISH_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
export const WISH_IMAGE_ACCEPT = WISH_IMAGE_TYPES.join(',')
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

let nextPickId = 0

/**
 * Ảnh chọn để gửi kèm một lời chúc: chọn nhiều ảnh một lúc, thêm dần, bỏ từng
 * ảnh. Ảnh sai định dạng hay quá 5 MB bị bỏ qua (kèm lời báo); chọn quá số
 * còn trống thì chỉ lấy đủ 4.
 *
 * add(fileList) trả về lời báo lỗi ('' nếu ổn) để form tự hiện chỗ của mình.
 */
export default function useImagePicks(max = MAX_WISH_IMAGES) {
  const [picks, setPicks] = useState([])
  const picksRef = useRef(picks)
  useEffect(() => { picksRef.current = picks }, [picks])

  // Rời trang thì nhả các link xem trước
  useEffect(() => () => {
    picksRef.current.forEach((pick) => URL.revokeObjectURL(pick.preview))
  }, [])

  const add = useCallback((fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return ''
    const valid = files.filter((file) => WISH_IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_BYTES)
    const room = Math.max(0, max - picksRef.current.length)
    const taken = valid.slice(0, room)
    if (taken.length) {
      const added = taken.map((file) => {
        nextPickId += 1
        return { id: nextPickId, file, preview: URL.createObjectURL(file) }
      })
      const next = [...picksRef.current, ...added]
      picksRef.current = next
      setPicks(next)
    }
    if (valid.length < files.length) {
      return files.length === 1
        ? 'Ảnh phải là JPG, PNG, GIF hoặc WebP, tối đa 5 MB.'
        : 'Có ảnh không phải JPG, PNG, GIF, WebP hoặc quá 5 MB — đã bỏ qua.'
    }
    if (taken.length < valid.length) return `Mỗi lời chúc kèm tối đa ${max} ảnh — đã lấy ${room ? `${room} ảnh đầu` : 'đủ rồi'}.`
    return ''
  }, [max])

  const remove = useCallback((id) => {
    const gone = picksRef.current.find((pick) => pick.id === id)
    if (gone) URL.revokeObjectURL(gone.preview)
    const next = picksRef.current.filter((pick) => pick.id !== id)
    picksRef.current = next
    setPicks(next)
  }, [])

  const clear = useCallback(() => {
    picksRef.current.forEach((pick) => URL.revokeObjectURL(pick.preview))
    picksRef.current = []
    setPicks([])
  }, [])

  return {
    picks,
    files: picks.map((pick) => pick.file),
    add,
    remove,
    clear,
    remaining: max - picks.length,
    full: picks.length >= max,
  }
}
