import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Petals from './paper/Petals'
import Envelope from './paper/Envelope'
import Postmark from './paper/Postmark'
import { nextEventDate } from '../lib/event'

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const diff = Math.max(0, target - now)
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
  }
}

// Màn "Chưa đến ngày 20/10" khi admin đang khóa trang quà (2d)
function GiftLocked() {
  const target = useMemo(() => nextEventDate().getTime(), [])
  const { days, hours, minutes } = useCountdown(target)

  return (
    <div className="gift-locked page-paper">
      <Petals count={1} />
      <div className="gift-locked__card">
        <Envelope wiggle logo={false}>
          <Postmark lines={['CHƯA', 'ĐẾN', { big: 'NGÀY' }]} size={84} rotate={-14} bg className="gift-locked__postmark" />
        </Envelope>
        <h1>Chưa đến ngày 20/10</h1>
        <p className="gift-locked__text">
          Món quà của bạn đang được gói lại thật kỹ để chờ đúng ngày.
          Hãy quay lại vào dịp 20/10 nhé — phong bì sẽ tự mở! 💝
        </p>
        <div className="countdown" role="timer" aria-label={`Còn ${days} ngày ${hours} giờ ${minutes} phút`}>
          <span><b>{days}</b>ngày</span>
          <span><b>{hours}</b>giờ</span>
          <span><b>{minutes}</b>phút</span>
        </div>
        <Link to="/" className="btn-ink">Về trang chủ</Link>
        <p className="gift-locked__note">
          Bạn vẫn có thể <Link to="/?wish=1">gửi lời chúc</Link> cho các bạn nữ ngay bây giờ.
        </p>
      </div>
    </div>
  )
}

export default GiftLocked
