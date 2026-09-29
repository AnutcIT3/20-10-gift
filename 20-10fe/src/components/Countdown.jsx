import { pad2, splitDuration } from '../lib/event'

// Ô đếm ngược kiểu tem ngày: ngày (chỉ khi còn) · giờ · phút · giây
function Countdown({ remainingMs, seconds = true }) {
  const parts = splitDuration(remainingMs)
  const label = [
    parts.days > 0 && `${parts.days} ngày`,
    `${parts.hours} giờ`,
    `${parts.minutes} phút`,
    seconds && `${parts.seconds} giây`,
  ].filter(Boolean).join(' ')

  return (
    <div className="countdown" role="timer" aria-label={`Còn ${label}`}>
      {parts.days > 0 && <span><b>{parts.days}</b>ngày</span>}
      <span><b>{pad2(parts.hours)}</b>giờ</span>
      <span><b>{pad2(parts.minutes)}</b>phút</span>
      {seconds && <span><b>{pad2(parts.seconds)}</b>giây</span>}
    </div>
  )
}

export default Countdown
