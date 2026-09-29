import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'
import { CLASS_NAME, formatStamp } from '../../lib/event'

const STATUSES = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
]
const TARGET_LABELS = { letter: 'trả lời thư', class: 'gửi các bạn nam', admin: 'gửi admin' }

function recipientOf(reply) {
  if (reply.target === 'class') return `Các bạn nam ${CLASS_NAME}`
  if (reply.target === 'admin') return 'Admin'
  if (reply.to?.kind === 'missing') return 'Lá thư đã bị gỡ'
  if (reply.letter_is_anonymous || !reply.letter_sender_name) return 'Người bạn ẩn danh'
  return reply.letter_sender_name
}

/**
 * Duyệt thư hồi âm: các bạn nữ đọc thư xong viết lại cho người gửi, cả lớp
 * hoặc admin. Hồi âm đã duyệt hiện ở Hộp thư hồi âm (/hoi-am) cho cả lớp đọc.
 */
function ReplyManager() {
  const navigate = useNavigate()
  const location = useLocation()
  const status = new URLSearchParams(location.search).get('status') || 'pending'
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: { total: 0, totalPages: 0 } })
  const [counts, setCounts] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  // Đánh số lượt load: response về muộn của tab cũ không ghi đè tab đang xem
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const [result, stats] = await Promise.all([
        adminApi.listReplies({ status, page }),
        adminApi.getStats().catch(() => null),
      ])
      if (seq !== loadSeq.current) return
      const totalPages = Math.max(Number(result.pagination?.totalPages) || 1, 1)
      if (page > totalPages) {
        setPage(totalPages)
        return
      }
      setData(result)
      if (stats?.replies) setCounts(stats.replies)
      setSelectedIds((current) => current.filter((id) => result.items.some((reply) => reply.id === id)))
      setError('')
    } catch (err) {
      if (seq === loadSeq.current) setError(err.message)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [status, page])

  // setTimeout 0 để setState không chạy đồng bộ trong effect (react-hooks v7)
  useEffect(() => {
    const initial = setTimeout(load, 0)
    return () => clearTimeout(initial)
  }, [load])

  const chooseTab = (value) => {
    setPage(1)
    setSelectedIds([])
    navigate(`/admin/replies?status=${value}`, { replace: true })
  }

  // Clear message/error TRƯỚC để toast remount và chạy lại animation
  const run = async (action, doneMessage) => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await action()
      setMessage(doneMessage)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Thông báo nói đúng hồi âm sẽ hiện ở đâu: thư riêng gửi admin và hồi âm cho
  // lá thư đã bị xoá không bao giờ lên Hộp thư công khai
  const approvedMessage = (reply) => {
    if (reply.target === 'admin') return 'Đã đánh dấu đã đọc — thư riêng, không lên Hộp thư hồi âm.'
    if (reply.to?.kind === 'missing') return 'Đã duyệt — lá thư gốc đã bị gỡ nên hồi âm không hiện ở Hộp thư.'
    return 'Đã duyệt hồi âm — giờ nó nằm ở Hộp thư hồi âm.'
  }

  const changeStatus = (reply, next) => run(
    () => adminApi.updateReplyStatus(reply.id, next),
    next === 'approved' ? approvedMessage(reply) : 'Đã từ chối hồi âm.',
  )

  const bulkChange = (next) => {
    if (!selectedIds.length) return undefined
    const count = selectedIds.length
    return run(async () => {
      await adminApi.bulkUpdateReplyStatus(selectedIds, next)
      setSelectedIds([])
    }, `Đã cập nhật ${count} hồi âm.`)
  }

  const remove = (id) => {
    if (!window.confirm('Xoá vĩnh viễn hồi âm này?')) return undefined
    return run(() => adminApi.deleteReply(id), 'Đã xoá hồi âm.')
  }

  const toggleSelected = (id) => setSelectedIds((current) => (
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  ))
  const allSelected = data.items.length > 0 && data.items.every((reply) => selectedIds.includes(reply.id))
  const toggleAll = () => setSelectedIds(allSelected ? [] : data.items.map((reply) => reply.id))
  const tabCount = (value) => (counts && counts[value] !== undefined ? ` · ${counts[value]}` : '')

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Hồi âm</p>
          <h2>Thư hồi âm</h2>
        </div>
        <div className="admin-header-actions">
          <div className="admin-tabs" role="group" aria-label="Lọc trạng thái hồi âm">
            {STATUSES.map((item) => (
              <button key={item.value} type="button" className={status === item.value ? 'active' : ''} aria-pressed={status === item.value} onClick={() => chooseTab(item.value)}>
                {item.label}{tabCount(item.value)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <p className="admin-hint reply-manager__hint">
        Các bạn nữ đọc thư xong viết lại cho người gửi, cho các bạn nam hoặc cho admin. Hồi âm đã
        duyệt hiện ở{' '}
        <a href="/hoi-am" target="_blank" rel="noreferrer">Hộp thư hồi âm</a> — ai có link trang đều đọc được;
        riêng hồi âm <b>gửi admin</b> là thư riêng, chỉ hiện ở đây. Ai gõ được tên một bạn cũng mở được trang
        quà của bạn ấy, nên hồi âm lạ giọng thì cứ từ chối như lời chúc lạ.
      </p>

      <div className="admin-filters">
        {data.items.length > 0 && (
          <label className="admin-check-label">
            <input type="checkbox" className="admin-check" checked={allSelected} onChange={toggleAll} />
            Chọn tất cả
          </label>
        )}
        <span className="admin-header-note">{data.pagination.total} hồi âm</span>
      </div>

      {selectedIds.length > 0 && (
        <div className="admin-bulk-bar">
          <b>{selectedIds.length} đã chọn</b>
          <button type="button" className="admin-btn admin-btn--sm admin-btn--moss" onClick={() => bulkChange('approved')} disabled={busy}>✓ Duyệt</button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => bulkChange('rejected')} disabled={busy}>Từ chối</button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
        </div>
      )}

      {message && <p key={message} className="admin-alert success" role="status">{message}</p>}
      {error && <p key={error} className="admin-alert error" role="alert">{error}</p>}

      {loading && !data.items.length ? <p className="admin-loading">Đang tải…</p> : data.items.length ? (
        <div className={`admin-letter-list${loading ? ' refreshing' : ''}`}>
          {data.items.map((reply) => {
            const tone = reply.status === 'approved' ? ' letter-row--approved' : reply.status === 'rejected' ? ' letter-row--rejected' : ''
            const quote = reply.target === 'letter' && (reply.letter_title || reply.letter_excerpt)
            return (
              <article key={reply.id} className={`letter-row${tone}`}>
                <input
                  type="checkbox"
                  className="admin-check"
                  checked={selectedIds.includes(reply.id)}
                  onChange={() => toggleSelected(reply.id)}
                  aria-label={`Chọn hồi âm của ${reply.student_name}`}
                />
                <div className="letter-row__main">
                  <div className="letter-row__meta">
                    <b className="letter-row__sender">{reply.student_name}</b>
                    <span className="letter-row__to">→ <b>{recipientOf(reply)}</b></span>
                    <span className="chip chip--beige">{TARGET_LABELS[reply.target] || reply.target}</span>
                    {reply.member_type === 'friend' && <span className="chip chip--moss">bạn ngoài lớp</span>}
                    {reply.member_type === 'test' && <span className="chip chip--moss">tài khoản thử</span>}
                    <span className={`admin-badge ${reply.status}`}>
                      {STATUSES.find((item) => item.value === reply.status)?.label || reply.status}
                    </span>
                  </div>
                  <p className="letter-row__content">{reply.content}</p>
                  {quote && (
                    <blockquote className="reply-row__quote">
                      ↳ trả lời thư{reply.letter_title ? ` "${reply.letter_title}"` : ''}
                      {reply.letter_excerpt ? `: ${reply.letter_excerpt}${reply.letter_excerpt.length >= 280 ? '…' : ''}` : ''}
                    </blockquote>
                  )}
                  <div className="letter-row__foot">
                    <time className="letter-row__time" dateTime={reply.created_at}>Gửi {formatStamp(reply.created_at)}</time>
                  </div>
                </div>
                <div className="letter-row__side">
                  {reply.status !== 'approved' && (
                    <button type="button" className="admin-btn admin-btn--moss" onClick={() => changeStatus(reply, 'approved')} disabled={busy}>
                      {reply.target === 'admin' ? '✓ Đã đọc' : '✓ Duyệt'}
                    </button>
                  )}
                  <div className="letter-row__pair">
                    {reply.status !== 'rejected' && (
                      <button type="button" className="admin-btn" onClick={() => changeStatus(reply, 'rejected')} disabled={busy}>Từ chối</button>
                    )}
                    <button type="button" className="admin-btn admin-btn--ghost" onClick={() => remove(reply.id)} disabled={busy}>Xoá</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="admin-empty">
          {status === 'pending' ? 'Không còn hồi âm nào chờ duyệt 🎉' : 'Chưa có hồi âm nào ở đây.'}
        </div>
      )}

      {data.pagination.totalPages > 1 && (
        <div className="admin-pagination">
          <button type="button" className="admin-btn admin-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button>
          <span>Trang {page} / {data.pagination.totalPages}</span>
          <button type="button" className="admin-btn admin-btn--sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Sau →</button>
        </div>
      )}
    </section>
  )
}

export default ReplyManager
