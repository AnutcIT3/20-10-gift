import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Petals from './paper/Petals'
import SeatLetterReveal from './SeatLetterReveal'
import '../styles/gift-reveal.css'

const SEAT_HOLD_MS = 1400   // nhìn sơ đồ lớp, thư nhô lên khỏi bàn của bạn ấy
const FLY_MS = 900          // thư bay từ bàn vào giữa màn hình và phóng to
const OPEN_MS = 2600        // niêm phong vỡ → nắp mở → thư trồi lên → "Dành riêng cho…"
const REDUCED_MS = 500

const prefersReducedMotion = () => typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function studentHasSeat(student) {
  return Boolean(student && (student.seat_row || student.seat_col || student.seat))
}

/**
 * Mở quà theo ba chặng: `seat` (sơ đồ lớp, thư nhô lên từ đúng bàn) → `fly`
 * (thư bay từ toạ độ bàn vào giữa, phóng to dần) → `open` (phong bì mở, thư
 * trồi lên). Không có chỗ ngồi (bạn ngoài lớp) thì vào thẳng `open`. Người tắt
 * chuyển động thấy ngay trạng thái cuối rồi sang trang quà.
 */
function GiftReveal({ onComplete, recipientName, student, via = '' }) {
  const [phase, setPhase] = useState(() => (
    prefersReducedMotion() || !studentHasSeat(student) ? 'open' : 'seat'
  ))
  const overlayRef = useRef(null)
  const envelopeRef = useRef(null)
  const completeRef = useRef(onComplete)

  useEffect(() => {
    completeRef.current = onComplete
  }, [onComplete])

  // Chặng bay: đo phong bì mini trên bàn và phong bì lớn ở giữa, rồi cho phong
  // bì lớn xuất phát từ đúng vị trí/kích thước mini (FLIP) — không cần state
  useLayoutEffect(() => {
    if (phase !== 'fly') return undefined
    const envelope = envelopeRef.current
    const origin = overlayRef.current?.querySelector('[data-active-letter]')
      || overlayRef.current?.querySelector('[data-active-desk]')
    if (!envelope || !origin || typeof envelope.animate !== 'function') return undefined
    const from = origin.getBoundingClientRect()
    const to = envelope.getBoundingClientRect()
    const scale = Math.max(0.06, from.width / to.width)
    const dx = from.left + from.width / 2 - (to.left + to.width / 2)
    const dy = from.top + from.height / 2 - (to.top + to.height / 2)
    const flight = envelope.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: .85 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'both' },
    )
    return () => flight.cancel()
  }, [phase])

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const delay = reduced ? REDUCED_MS : phase === 'seat' ? SEAT_HOLD_MS : phase === 'fly' ? FLY_MS : OPEN_MS
    const timer = setTimeout(() => {
      if (reduced || phase === 'open') completeRef.current?.()
      else setPhase(phase === 'seat' ? 'fly' : 'open')
    }, delay)
    return () => clearTimeout(timer)
  }, [phase])

  const open = phase === 'open'

  return (
    <div
      ref={overlayRef}
      className={`reveal reveal--${phase}`}
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-label="Đang mở quà..."
    >
      {open && <Petals count={4} fast />}
      {phase !== 'open' && <SeatLetterReveal student={student} leaving={phase === 'fly'} />}
      {phase !== 'seat' && (
        <div ref={envelopeRef} className={`reveal__envelope${open ? ' is-open' : ''}`} aria-hidden="true">
          <div className="reveal__body" />
          <div className="reveal__flap" />
          {/* Thư nằm giữa thân và mặt trước: bị cánh/túi che khi còn trong phong bì */}
          <div className="reveal__letter">
            {recipientName && <><span>Gửi {recipientName},</span><br /></>}
            Chúc cậu 20/10 thật vui…
          </div>
          <div className="reveal__wing reveal__wing--left" />
          <div className="reveal__wing reveal__wing--right" />
          <div className="reveal__pocket" />
          <div className="reveal__seal">20.10</div>
        </div>
      )}
      {open && (
        <p className="reveal__label" aria-hidden="true">
          {recipientName ? `Dành riêng cho ${recipientName} 🌷` : 'Mở quà nào! 🌷'}
          {/* Mở quà bằng Face ID thì thêm "huy hiệu" nhỏ — chi tiết để khoe nhau */}
          {via === 'face' && <small className="reveal__via">mở bằng Mắt thần 20/10 ✨</small>}
        </p>
      )}
    </div>
  )
}

export default GiftReveal
