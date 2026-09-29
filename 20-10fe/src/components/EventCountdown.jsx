import { useEffect, useRef } from 'react'
import Countdown from './Countdown'
import useNow from '../hooks/useNow'
import { formatClock } from '../lib/event'

/**
 * Thẻ đếm ngược trên trang chủ khi admin đã hẹn giờ quà tự mở. Về 0 thì gọi
 * onDone sau một khoảng ngẫu nhiên ngắn: cả lớp cùng chờ thì các máy hỏi lại
 * máy chủ rải trong ~2 giây, không dồn hết vào đúng một khoảnh khắc.
 */
function EventCountdown({ unlockAt, offset = 0, onDone }) {
  const now = useNow(1000)
  const remaining = new Date(unlockAt).getTime() - (now + offset)
  const done = remaining <= 0
  // onDone qua ref: trang cha render lại (gõ phím, poll) không được huỷ rồi
  // hẹn lại lượt hỏi máy chủ — effect chỉ chạy lại khi done đổi
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (!done) return undefined
    const timer = setTimeout(() => onDoneRef.current?.(), 300 + Math.random() * 1700)
    return () => clearTimeout(timer)
  }, [done])

  return (
    <section className={`event-countdown${done ? ' is-done' : ''}`} aria-label="Đếm ngược tới lúc mở quà">
      <p className="event-countdown__label">
        {done ? 'Tới giờ rồi! Đang mở quà…' : <>Quà tự mở lúc <b>{formatClock(unlockAt)}</b></>}
      </p>
      {!done && <Countdown remainingMs={remaining} />}
      <p className="event-countdown__note">Các cậu cùng chờ nhé, tới giờ là cùng mở quà một lúc 🌸</p>
    </section>
  )
}

export default EventCountdown
