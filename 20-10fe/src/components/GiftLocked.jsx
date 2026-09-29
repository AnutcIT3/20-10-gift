import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Countdown from './Countdown'
import Petals from './paper/Petals'
import Envelope from './paper/Envelope'
import Postmark from './paper/Postmark'
import useEventStatus from '../hooks/useEventStatus'
import useNow from '../hooks/useNow'
import { formatClock, nextEventDate, serverOffset } from '../lib/event'

/**
 * Màn "Chưa đến ngày 20/10" khi admin đang khóa trang quà (2d). Admin đã hẹn
 * giờ tự mở thì đếm tới từng giây theo đồng hồ máy chủ, về 0 là gọi onUnlock
 * để trang tự tải lại — ai để sẵn trang này lúc 23:59 sẽ thấy quà tự mở.
 * Chưa hẹn giờ thì đếm theo phút tới 00:00 ngày 20/10 như trước.
 * Màn này tự hỏi lại trạng thái (30 giây/lần), nên admin hẹn hay đổi giờ sau
 * khi trang đã mở, hoặc gạt mở tay, thì màn chờ vẫn theo kịp.
 */
function GiftLocked({ unlockAt = null, serverNow = null, onUnlock }) {
  const { status, offset: liveOffset } = useEventStatus()
  const [initialOffset] = useState(() => (serverNow ? serverOffset(serverNow, Date.now()) : 0))
  const [fallbackTarget] = useState(() => nextEventDate().getTime())
  const liveUnlockAt = status ? status.unlockAt : unlockAt
  const scheduled = Boolean(liveUnlockAt)
  const target = scheduled ? new Date(liveUnlockAt).getTime() : fallbackTarget
  const offset = status ? liveOffset : initialOffset
  const now = useNow(scheduled ? 1000 : 60_000)
  const remaining = target - (now + offset)
  const unlockedNow = Boolean(status && !status.locked)
  const opening = unlockedNow || (scheduled && remaining <= 0)
  // onUnlock qua ref để trang cha render lại không huỷ lượt tải lại đã hẹn
  const onUnlockRef = useRef(onUnlock)
  useEffect(() => {
    onUnlockRef.current = onUnlock
  }, [onUnlock])

  useEffect(() => {
    if (!opening) return undefined
    // Rải trong ~1,5 giây để cả lớp không cùng hỏi máy chủ một lúc
    const timer = setTimeout(() => onUnlockRef.current?.(), 300 + Math.random() * 1200)
    return () => clearTimeout(timer)
  }, [opening])

  return (
    <div className="gift-locked page-paper">
      <Petals count={1} />
      <div className="gift-locked__card">
        <Envelope wiggle logo={false}>
          <Postmark lines={['CHƯA', 'ĐẾN', { big: 'NGÀY' }]} size={84} rotate={-14} bg className="gift-locked__postmark" />
        </Envelope>
        <h1>{opening ? 'Tới giờ rồi!' : 'Chưa đến ngày 20/10'}</h1>
        <p className="gift-locked__text">
          {opening
            ? 'Phong bì đang mở… chờ mình một chút nhé! 💝'
            : scheduled
              ? <>Món quà sẽ tự mở lúc <b>{formatClock(liveUnlockAt)}</b>. Cứ để trang này mở — tới giờ phong bì tự bung ra! 💝</>
              : 'Món quà của bạn đang được gói lại thật kỹ để chờ đúng ngày. Hãy quay lại vào dịp 20/10 nhé — phong bì sẽ tự mở! 💝'}
        </p>
        {!opening && <Countdown remainingMs={remaining} seconds={scheduled} />}
        <Link to="/" className="btn-ink">Về trang chủ</Link>
        <p className="gift-locked__note">
          Bạn vẫn có thể <Link to="/?wish=1">gửi lời chúc</Link> cho các bạn nữ ngay bây giờ.
        </p>
      </div>
    </div>
  )
}

export default GiftLocked
