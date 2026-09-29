import { useState } from 'react'
import { adminApi } from '../../api/adminApi'
import ClassFlower from '../../components/ClassFlower'
import useNow from '../../hooks/useNow'
import {
  CLASS_NAME, formatClock, formatStamp, nextEventDate, splitDuration,
} from '../../lib/event'

// Giá trị cho <input type="datetime-local"> theo giờ máy admin
function toDateTimeLocal(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

// Qua 20/10 thì "00:00 · 20/10 kế tiếp" là năm sau — nút hẹn nhanh chỉ hiện
// khi ngày đó còn trong vòng hai tháng
const QUICK_SCHEDULE_WINDOW_MS = 62 * 24 * 60 * 60 * 1000

function describeRemaining(ms) {
  const { days, hours, minutes } = splitDuration(ms)
  if (days > 0) return `còn ${days} ngày ${hours} giờ`
  if (hours > 0) return `còn ${hours} giờ ${minutes} phút`
  return `còn ${Math.max(minutes, 1)} phút`
}

/**
 * Thẻ "Ngày 20/10" trên Tổng quan: lúc khoá thì hẹn giờ quà tự mở (cả lớp
 * cùng đếm ngược trên trang chủ); lúc đã mở thì theo dõi bông hoa 12A1 và đặt
 * lại hoa sau các lượt mở thử. Công tắc khoá/mở tay vẫn ở thanh bên.
 * Thẻ được dựng lại mỗi khi lịch đổi (key ở Dashboard) nên lời báo thành công
 * đi qua onChanged(message) để Tổng quan hiện, không nằm trong state của thẻ.
 */
function EventCard({
  settings, opens, onBusy, onChanged,
}) {
  const locked = Boolean(settings?.gift_pages_locked)
  const unlockAt = settings?.gift_unlock_at || null
  const [draft, setDraft] = useState(() => toDateTimeLocal(unlockAt || nextEventDate()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const now = useNow(30_000)
  const upcomingEvent = nextEventDate(new Date(now))
  const showQuickSchedule = upcomingEvent.getTime() - now < QUICK_SCHEDULE_WINDOW_MS

  const save = async (patch, doneMessage) => {
    setSaving(true)
    setError('')
    // Tổng quan xoá thông báo cũ trước: cùng một lời báo lặp lại vẫn hiện lại
    onBusy?.()
    try {
      await adminApi.updateSettings(patch)
      onChanged?.(doneMessage)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const schedule = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      setError('Chọn ngày giờ tự mở trước đã.')
      return undefined
    }
    return save({ gift_unlock_at: date.toISOString() }, `Đã hẹn: quà tự mở lúc ${formatClock(date)}.`)
  }

  const scheduleMidnight = () => {
    setDraft(toDateTimeLocal(upcomingEvent))
    return schedule(upcomingEvent)
  }

  const resetFlower = () => {
    if (!window.confirm('Đặt lại bông hoa? Các lượt mở quà trước giờ này không được tính nữa (không xoá dữ liệu).')) return undefined
    return save({ reset_gift_opens: true }, 'Đã đặt lại bông hoa — hoa bắt đầu đếm từ bây giờ.')
  }

  return (
    <section className="admin-card admin-card--pad dash-event" aria-labelledby="event-title">
      <h3 id="event-title">🎉 Ngày 20/10</h3>
      {locked ? (
        <>
          <p className="dash-event__state">
            Trang quà đang <b>KHOÁ</b>.{' '}
            {unlockAt
              ? <>Tự mở lúc <b>{formatClock(unlockAt)}</b> ({describeRemaining(new Date(unlockAt).getTime() - now)}).</>
              : 'Chưa hẹn giờ tự mở — đến ngày phải gạt công tắc ở thanh bên.'}
          </p>
          <div className="dash-event__row">
            <input
              type="datetime-local"
              className="admin-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Giờ quà tự mở"
            />
            <button type="button" className="admin-btn admin-btn--sm admin-btn--moss" onClick={() => schedule(draft)} disabled={saving}>
              {unlockAt ? 'Đổi giờ' : 'Hẹn giờ'}
            </button>
          </div>
          <div className="dash-event__row">
            {showQuickSchedule && (
              <button type="button" className="admin-btn admin-btn--sm" onClick={scheduleMidnight} disabled={saving}>
                Hẹn đúng 00:00 · 20/10
              </button>
            )}
            {unlockAt && (
              <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => save({ gift_unlock_at: null }, 'Đã huỷ giờ tự mở.')} disabled={saving}>
                Huỷ hẹn
              </button>
            )}
          </div>
          <p className="admin-hint dash-event__hint">
            Có giờ hẹn thì trang chủ và màn "chưa đến ngày" đếm ngược tới từng giây; về 0 là quà tự mở
            và bông hoa {CLASS_NAME} bắt đầu đếm từ đúng lúc đó.
          </p>
        </>
      ) : (
        <>
          <p className="dash-event__state">Trang quà đang <b>MỞ</b>.</p>
          {opens ? (
            <div className="dash-event__flower">
              <ClassFlower opened={opens.opened} total={opens.total} compact caption={false} />
              <div>
                <p className="dash-event__count">
                  <b>{opens.opened}/{opens.total}</b> bạn đã mở quà
                </p>
                <p className="admin-hint dash-event__hint">
                  {opens.since ? `Tính từ ${formatStamp(opens.since)}.` : 'Tính cả các lượt mở thử.'}
                  {' '}Chỉ đếm lượt mở từ trang chủ (gõ tên / Face ID), không đếm link mở thẳng.
                </p>
                <button type="button" className="admin-btn admin-btn--sm" onClick={resetFlower} disabled={saving}>
                  Đặt lại bông hoa
                </button>
              </div>
            </div>
          ) : (
            <p className="admin-hint dash-event__hint">Chạy <code>npm run migrate</code> để bật bông hoa {CLASS_NAME}.</p>
          )}
        </>
      )}
      {error && <p key={error} className="dash-event__error" role="alert">{error}</p>}
    </section>
  )
}

export default EventCard
