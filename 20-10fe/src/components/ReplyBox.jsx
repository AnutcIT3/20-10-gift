import { useEffect, useId, useRef, useState } from 'react'
import giftRepository from '../api/giftRepository'

const MAX_LENGTH = 2000

/**
 * Hồi âm của chủ trang quà: những dòng đã gửi (kèm "chờ duyệt") và một nút mở
 * ô viết. `target` là 'letter' (kèm letterId), 'class' hoặc 'admin'.
 * Hồi âm hiện ở Hộp thư hồi âm (ai mở trang cũng đọc được) sau khi admin
 * duyệt; riêng hồi âm gửi admin là thư riêng, chỉ admin đọc. Ô viết nói rõ.
 */
function ReplyBox({
  accessCode, target, letterId = null, recipient, replies = [], onSent,
  openLabel = '✉ Hồi âm', moreLabel = '✉ Viết thêm', className = '',
}) {
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // Lời báo cho trình đọc màn hình sau khi gửi; focus trả về nút mở ô viết
  // (ô viết biến mất cùng nút đang giữ focus, không trả thì focus rơi về body)
  const [announcement, setAnnouncement] = useState('')
  const openButtonRef = useRef(null)
  const restoreFocusRef = useRef(false)

  useEffect(() => {
    if (open || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    openButtonRef.current?.focus()
  }, [open])

  const close = () => {
    restoreFocusRef.current = true
    setOpen(false)
    setError('')
  }

  const openForm = () => {
    setAnnouncement('')
    setOpen(true)
  }

  const submit = async (event) => {
    event.preventDefault()
    const text = content.trim()
    if (!text) {
      setError('Viết vài chữ rồi hẵng gửi nhé.')
      return
    }
    setSending(true)
    setError('')
    try {
      const reply = await giftRepository.createReply(accessCode, {
        target,
        letter_id: target === 'letter' ? letterId : undefined,
        content: text,
      })
      onSent?.(reply)
      setContent('')
      restoreFocusRef.current = true
      setOpen(false)
      setAnnouncement(target === 'admin'
        ? 'Đã gửi hồi âm cho admin.'
        : 'Đã gửi hồi âm — chờ admin duyệt rồi sẽ lên Hộp thư hồi âm.')
    } catch (err) {
      setError(err.message || 'Chưa gửi được, thử lại nhé.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`reply-box ${className}`}>
      {replies.map((reply) => (
        <div key={reply.id} className="reply-note">
          {/* Thư riêng gửi admin: ai gõ được tên cậu cũng mở được trang này,
              nên chỉ báo đã gửi, không hiện lại nội dung */}
          {reply.target === 'admin' ? (
            <span className="reply-note__label">
              {reply.status === 'approved'
                ? '✉ Admin đã đọc thư riêng của cậu'
                : '✉ Cậu đã gửi admin một lá thư riêng'}
            </span>
          ) : (
            <>
              <span className="reply-note__label">
                ✉ Cậu đã hồi âm{reply.status === 'approved' ? '' : ' · chờ duyệt'}
              </span>
              <p className="reply-note__text">{reply.content}</p>
            </>
          )}
        </div>
      ))}
      {open ? (
        <form className="reply-form" onSubmit={submit}>
          <label className="reply-form__label" htmlFor={fieldId}>Gửi {recipient}:</label>
          <textarea
            id={fieldId}
            className="input-hand reply-form__input"
            value={content}
            maxLength={MAX_LENGTH}
            rows={3}
            autoFocus
            onChange={(event) => setContent(event.target.value)}
            placeholder="Viết vài dòng gửi lại nhé…"
          />
          <p className="reply-form__hint">
            {target === 'admin'
              ? <>Thư riêng: chỉ <b>admin</b> đọc được — không lên Hộp thư hồi âm, trang này cũng không hiện lại.</>
              : <>Hồi âm hiện ở <b>Hộp thư hồi âm</b> sau khi admin duyệt — ai mở trang cũng đọc được, kể cả khách.</>}
          </p>
          {error && <p className="alert-note reply-form__alert" role="alert">{error}</p>}
          <div className="reply-form__actions">
            <button type="button" className="btn-dashed" onClick={close} disabled={sending}>Thôi</button>
            <button className="btn-stamp btn-stamp--fill reply-form__send" disabled={sending}>
              {sending ? 'Đang gửi…' : 'Gửi hồi âm ✉'}
            </button>
          </div>
        </form>
      ) : (
        <button ref={openButtonRef} type="button" className="btn-dashed reply-box__open" onClick={openForm}>
          {replies.length ? moreLabel : openLabel}
        </button>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  )
}

export default ReplyBox
