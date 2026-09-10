import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'

const EMOJI_MAP = {
  smile: '🙂', laugh: '😄', angry: '😠', kiss: '😘',
  love: '😍', sad: '😞', thumbsup: '👍', think: '🤔',
}
const AUTO_REFRESH_MS = 30_000
const INBOX_PREVIEW = 3
// Thẻ Face ID: nhãn cho từng con số trong stats.face, theo thứ tự hiện chip
const FACE_CHIPS = [
  ['matched', 'Nhận ra'],
  ['rejected', 'Từ chối'],
  ['confirmedYes', 'Đúng là mình'],
  ['confirmedNo', 'Không phải mình'],
]

function greetingByHour(date = new Date()) {
  const hour = date.getHours()
  if (hour < 11) return 'Chào buổi sáng'
  if (hour < 14) return 'Chào buổi trưa'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

function formatReveal(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function StatCard({ to, value, label, tone = '' }) {
  const className = `dash-stat${tone ? ` dash-stat--${tone}` : ''}`
  const inner = (
    <>
      <b>{value ?? '—'}</b>
      <span>{label}</span>
    </>
  )
  return to ? <Link to={to} className={className}>{inner}</Link> : <div className={className}>{inner}</div>
}

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [inbox, setInbox] = useState({ items: [], total: 0 })
  const [selectedIds, setSelectedIds] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const timerRef = useRef(null)
  // Đánh số lượt load: response auto-refresh cũ về muộn không được ghi đè
  // dữ liệu mới hơn
  const loadSeq = useRef(0)

  const load = useCallback(async (silent = false) => {
    const seq = ++loadSeq.current
    if (!silent) setLoading(true)
    try {
      const [statsData, pending] = await Promise.all([
        adminApi.getStats(),
        adminApi.listLetters({ status: 'pending', page: 1, pageSize: INBOX_PREVIEW }),
      ])
      if (seq !== loadSeq.current) return
      setStats(statsData)
      setInbox({ items: pending?.items || [], total: Number(pending?.pagination?.total || 0) })
      setSelectedIds((current) => current.filter((id) => (pending?.items || []).some((letter) => letter.id === id)))
      setLastRefresh(new Date())
      setError('')
    } catch (err) {
      if (seq === loadSeq.current) setError(err.message)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = setTimeout(() => load(), 0)
    timerRef.current = setInterval(() => load(true), AUTO_REFRESH_MS)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(timerRef.current)
    }
  }, [load])

  // Handler nào cũng clear message/error TRƯỚC để toast remount và chạy lại animation
  const decide = async (id, status) => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await adminApi.updateLetterStatus(id, status)
      setMessage(status === 'approved' ? 'Đã duyệt lời chúc.' : 'Đã từ chối lời chúc.')
      await load(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const approveSelected = async () => {
    if (!selectedIds.length) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await adminApi.bulkUpdateLetterStatus(selectedIds, 'approved')
      setMessage(`Đã duyệt ${selectedIds.length} lời chúc.`)
      setSelectedIds([])
      await load(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const exportStudents = async () => {
    setExporting(true)
    setMessage('')
    setError('')
    try { await adminApi.exportStudents(); setMessage('Xuất CSV thành công!') }
    catch (err) { setError(err.message) }
    finally { setExporting(false) }
  }

  const allSelected = inbox.items.length > 0 && inbox.items.every((letter) => selectedIds.includes(letter.id))
  const toggleAll = () => setSelectedIds(allSelected ? [] : inbox.items.map((letter) => letter.id))
  const toggleOne = (id) => setSelectedIds((current) => (
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  ))

  const topViewed = stats?.topViewed || []
  const maxViews = topViewed[0]?.view_count || 1
  const reactions = Object.entries(stats?.reactions?.byEmoji || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
  // Face ID chỉ ghi con số (match/reject + câu trả lời "đúng là mình"), không
  // ảnh. stats.face vắng khi backend chưa có bảng log; 0 lượt cũng coi là trống
  // như hai thẻ bên cạnh — confirmed chỉ đếm trên các lượt match/reject nên
  // matched + rejected là tổng
  const face = stats?.face
  const faceTotal = face ? Number(face.matched || 0) + Number(face.rejected || 0) : 0

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Tổng quan</p>
          <h2>{greetingByHour()}, admin</h2>
        </div>
        <div className="admin-header-actions">
          {lastRefresh && (
            <span className="admin-header-note">
              Cập nhật {lastRefresh.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · tự làm mới 30 s
            </span>
          )}
          <button type="button" className="admin-btn" onClick={() => load()} disabled={loading}>
            {loading ? '⟳ Đang tải…' : '⟳ Làm mới'}
          </button>
          <button type="button" className="admin-btn" onClick={exportStudents} disabled={exporting}>
            {exporting ? 'Đang xuất…' : '⤓ Xuất CSV'}
          </button>
        </div>
      </header>

      {message && <p key={message} className="admin-alert success" role="status">{message}</p>}
      {error && <p key={error} className="admin-alert error" role="alert">{error}</p>}

      <div className="dash-stats">
        <StatCard to="/admin/letters?status=pending" value={stats?.letters?.pending} label="Chờ duyệt" tone="clay" />
        <StatCard to="/admin/letters?status=approved" value={stats?.letters?.approved} label="Đã duyệt" tone="moss" />
        <StatCard to="/admin/letters?status=rejected" value={stats?.letters?.rejected} label="Từ chối" tone="line" />
        <StatCard
          to="/admin/students"
          value={stats?.students?.total}
          label={stats ? `Học sinh · ${stats.students?.active ?? 0} hoạt động` : 'Học sinh'}
        />
        <StatCard value={stats?.students?.totalViews} label="Lượt xem" />
        <StatCard
          to="/admin/gallery"
          value={stats?.gallery?.total}
          label={stats ? `Ảnh · ${stats.gallery?.studentsWithoutImages ?? 0} bạn chưa có` : 'Ảnh'}
        />
        <StatCard
          to="/admin/students?filter=noavatar"
          value={stats?.students?.withoutAvatar}
          label="Bạn chưa có ảnh đại diện"
          tone={stats?.students?.withoutAvatar ? 'clay' : 'moss'}
        />
      </div>

      <div className="dash-grid">
        {/* Việc cần làm lên đầu: duyệt lời chúc chờ */}
        <section className="admin-card" aria-labelledby="inbox-title">
          <div className="admin-card__head">
            <h3 id="inbox-title">Hộp thư chờ duyệt</h3>
            {inbox.items.length > 0 && (
              <div className="admin-header-actions">
                <button type="button" className="admin-btn admin-btn--sm" onClick={toggleAll} disabled={busy}>
                  {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
                </button>
                <button type="button" className="admin-btn admin-btn--sm admin-btn--moss" onClick={approveSelected} disabled={busy || !selectedIds.length}>
                  ✓ Duyệt{selectedIds.length ? ` ${selectedIds.length}` : ''}
                </button>
              </div>
            )}
          </div>
          {loading && !stats ? (
            <p className="admin-loading" style={{ padding: '16px 20px' }}>Đang tải…</p>
          ) : inbox.items.length === 0 ? (
            <p className="admin-loading" style={{ padding: '18px 20px', margin: 0 }}>Hộp thư trống — không còn lời chúc nào chờ duyệt 🎉</p>
          ) : inbox.items.map((letter) => {
            const anonymous = letter.is_anonymous || !letter.sender_name
            return (
              <div key={letter.id} className="inbox-row">
                <input
                  type="checkbox"
                  className="admin-check"
                  checked={selectedIds.includes(letter.id)}
                  onChange={() => toggleOne(letter.id)}
                  aria-label={`Chọn lời chúc của ${anonymous ? 'người ẩn danh' : letter.sender_name}`}
                />
                <div>
                  <div className="inbox-row__meta">
                    <b className={`inbox-row__sender${anonymous ? ' inbox-row__sender--anon' : ''}`}>
                      {anonymous ? 'Ẩn danh' : letter.sender_name}
                    </b>
                    <span className="inbox-row__to">→ {letter.student_name}</span>
                    {letter.reveal_at && <span className="chip chip--peach">⏰ hiện {formatReveal(letter.reveal_at)}</span>}
                    {letter.image_url && <span className="chip chip--beige">📷 1 ảnh</span>}
                    {letter.member_type === 'friend' && <span className="chip chip--moss">bạn ngoài lớp</span>}
                  </div>
                  <p className="inbox-row__text">{letter.content}</p>
                </div>
                <div className="inbox-row__actions">
                  <button type="button" className="admin-btn admin-btn--icon admin-btn--ok" onClick={() => decide(letter.id, 'approved')} disabled={busy} aria-label="Duyệt">✓</button>
                  <button type="button" className="admin-btn admin-btn--icon admin-btn--no" onClick={() => decide(letter.id, 'rejected')} disabled={busy} aria-label="Từ chối">✕</button>
                </div>
              </div>
            )
          })}
          {inbox.total > 0 && (
            <Link to="/admin/letters?status=pending" className="admin-card__link">
              Xem cả {inbox.total} lời chúc chờ duyệt →
            </Link>
          )}
        </section>

        <div className="dash-side">
          <section className="admin-card admin-card--pad" aria-labelledby="top-title">
            <h3 id="top-title">Được xem nhiều</h3>
            {loading && !stats ? <p className="admin-loading">Đang tải…</p> : topViewed.length === 0 ? (
              <p className="admin-hint" style={{ margin: 0 }}>Chưa có lượt xem nào.</p>
            ) : (
              <ul className="dash-bars">
                {topViewed.map((student) => (
                  <li key={student.id} className="dash-bar">
                    <span className="dash-bar__label" title={student.full_name}>{student.full_name}</span>
                    <div className="dash-bar__track">
                      <div className="dash-bar__fill" style={{ width: `${Math.round((student.view_count / maxViews) * 100)}%` }} />
                    </div>
                    <b className="dash-bar__value">{student.view_count}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-card admin-card--pad" aria-labelledby="reactions-title">
            <h3 id="reactions-title">Cảm xúc · {stats?.reactions?.total ?? 0}</h3>
            {loading && !stats ? <p className="admin-loading">Đang tải…</p> : reactions.length === 0 ? (
              <p className="admin-hint" style={{ margin: 0 }}>Chưa có cảm xúc nào.</p>
            ) : (
              <div className="dash-chips">
                {reactions.map(([key, count], index) => (
                  <span key={key} className={`dash-chip${index === 0 ? ' dash-chip--top' : ''}`}>
                    {EMOJI_MAP[key] || key} <b>{count}</b>
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="admin-card admin-card--pad" aria-labelledby="face-title">
            <h3 id="face-title">✨ Face ID</h3>
            {loading && !stats ? <p className="admin-loading">Đang tải…</p> : !face || faceTotal === 0 ? (
              <p className="admin-hint" style={{ margin: 0 }}>Chưa có lượt nào.</p>
            ) : (
              <div className="dash-chips">
                {FACE_CHIPS.map(([key, label], index) => (
                  <span key={key} className={`dash-chip${index === 0 ? ' dash-chip--top' : ''}`}>
                    {label} <b>{face[key] ?? 0}</b>
                  </span>
                ))}
              </div>
            )}
            <p className="admin-hint" style={{ margin: '12px 0 0' }}>Số liệu chỉ là con số, không lưu ảnh.</p>
          </section>
        </div>
      </div>
    </section>
  )
}

export default Dashboard
