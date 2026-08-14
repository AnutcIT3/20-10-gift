import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Hành vi chuẩn cho dialog: Esc để đóng, khóa Tab trong dialog, tự focus phần
 * tử đầu tiên khi mở và trả focus về chỗ cũ khi đóng.
 *
 * Gọi hook vô điều kiện với cờ `active`; gắn ref trả về vào phần tử dialog
 * (chỉ render khi active). Mẫu tham chiếu: lightbox trong PhotoGallery.
 */
function useDialogA11y(active, onClose) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!active) return undefined
    const dialog = dialogRef.current
    if (!dialog) return undefined

    const previousFocus = document.activeElement
    // Focus vào chính dialog, KHÔNG vào phần tử đầu tiên: nhiều dialog xác nhận
    // có nút "Xóa vĩnh viễn" đứng đầu — auto-focus vào đó thì Enter giữ/bấm đúp
    // từ nút mở dialog sẽ xác nhận xóa ngay. Tôn trọng autoFocus có sẵn bên trong.
    if (!dialog.contains(document.activeElement)) {
      dialog.setAttribute('tabindex', '-1')
      dialog.focus()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [active])

  return dialogRef
}

export default useDialogA11y
