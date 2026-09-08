import { useEffect, useRef } from 'react'
import Petals from './paper/Petals'
import '../styles/gift-reveal.css'

const REVEAL_DURATION = 2400
const REDUCED_DURATION = 500

/**
 * Mở phong bì: niêm phong vỡ (0–0.5s) → nắp lật (0.2–1.2s) → thư bay lên
 * (0.9–2.3s) → "Dành riêng cho …" (1.6s) → onComplete (≈2.4s). Toàn bộ trình
 * tự nằm trong CSS; người tắt chuyển động thấy ngay trạng thái cuối.
 */
function GiftReveal({ onComplete, recipientName }) {
  const completeRef = useRef(onComplete)

  useEffect(() => {
    completeRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(() => completeRef.current?.(), reduced ? REDUCED_DURATION : REVEAL_DURATION)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="reveal" role="status" aria-live="polite" aria-label="Đang mở quà...">
      <Petals count={4} fast />
      <div className="reveal__envelope" aria-hidden="true">
        <div className="reveal__letter">
          {recipientName && <><span>Gửi {recipientName},</span><br /></>}
          Chúc cậu 20/10 thật vui…
        </div>
        <div className="reveal__body" />
        <div className="reveal__wing reveal__wing--left" />
        <div className="reveal__wing reveal__wing--right" />
        <div className="reveal__pocket" />
        <div className="reveal__flap" />
        <div className="reveal__seal">20.10</div>
      </div>
      <p className="reveal__label" aria-hidden="true">
        {recipientName ? `Dành riêng cho ${recipientName} 🌷` : 'Mở quà nào! 🌷'}
      </p>
    </div>
  )
}

export default GiftReveal
