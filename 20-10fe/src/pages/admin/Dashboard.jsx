import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'

const EMOJI_MAP = {
  smile: '🙂', laugh: '😄', angry: '😠', kiss: '😘',
  love: '😍', sad: '😞', thumbsup: '👍', think: '🤔',
}
const REACTION_ORDER = ['love', 'laugh', 'smile', 'thumbsup', 'kiss', 'think', 'sad', 'angry']
const AUTO_REFRESH_MS = 30_000

function StatCard({ to, value, label, accent }) {
  const inner = (
    <div className="dash-stat-inner" style={accent ? { '--dash-accent': accent } : {}}>
      <strong>{value ?? '—'}</strong>
      <span>{label}</span>
    </div>
  )
  return to ? <Link to={to} className="dash-stat-card">{inner}</Link>
    : <div className="dash-stat-card">{inner}</div>
}

function BarChart({ items, max }) {
  if (!items.length) return <p className="dash-empty-msg">Chưa có dữ liệu</p>
  return (
    <ul className="dash-bar-list">
      {items.map(({ label, value, sub }) => (
        <li key={label} className="dash-bar-row">
          <span className="dash-bar-label" title={label}>{label}</span>
          <div className="dash-bar-track">
            <div
              className="dash-bar-fill"
              style={{ width: max ? `${Math.round((value / max) * 100)}%` : '0%' }}
            />
          </div>
          <span className="dash-bar-value">{value}{sub ? <small>{sub}</small> : null}</span>
        </li>
      ))}
    </ul>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)
  const timerRef = useRef(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setStats(await adminApi.getStats())
      setLastRefresh(new Date())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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

  const topViewed = stats?.topViewed || []
  const maxViews = topViewed[0]?.view_count || 1
  const reactions = stats?.reactions?.byEmoji || {}

  return (
    <section className="dash-root">
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Tổng quan</p>
          <h2>Bảng điều khiển</h2>
        </div>
        <div className="dash-header-actions">
          {lastRefresh && (
            <span className="dash-last-refresh">
              Cập nhật {lastRefresh.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button type="button" className="dash-refresh-btn" onClick={() => load()} disabled={loading}>
            {loading ? '⟳ Đang tải...' : '⟳ Làm mới'}
          </button>
        </div>
      </header>

      {error && <p className="admin-alert error" role="alert">{error}</p>}

      {/* ── Học sinh ── */}
      <section className="dash-section">
        <h3 className="dash-section-title">👩‍🎓 Học sinh</h3>
        <div className="dash-stat-grid">
          <StatCard to="/admin/students" value={stats?.students.total} label="Tổng học sinh" />
          <StatCard to="/admin/students" value={stats?.students.active} label="Đang hoạt động" accent="#8e5ea2" />
          <StatCard value={stats?.students.totalViews} label="Tổng lượt xem" accent="#e05e99" />
          <StatCard to="/admin/gallery" value={stats?.gallery.studentsWithoutImages} label="Chưa có ảnh" accent="#d97706" />
        </div>
      </section>

      {/* ── Lời chúc ── */}
      <section className="dash-section">
        <h3 className="dash-section-title">💌 Lời chúc</h3>
        <div className="dash-stat-grid">
          <StatCard
            to="/admin/letters?status=pending"
            value={stats?.letters.pending}
            label="Chờ duyệt"
            accent="#d97706"
          />
          <StatCard
            to="/admin/letters?status=approved"
            value={stats?.letters.approved}
            label="Đã duyệt"
            accent="#16a34a"
          />
          <StatCard
            to="/admin/letters?status=rejected"
            value={stats?.letters.rejected}
            label="Đã từ chối"
            accent="#dc2626"
          />
          <StatCard value={stats?.gallery.total} label="Tổng ảnh" to="/admin/gallery" />
        </div>
      </section>

      <div className="dash-two-col">
        {/* ── Top được xem ── */}
        <section className="dash-panel">
          <h3 className="dash-panel-title">👁️ Top lượt xem</h3>
          {loading && !stats ? <p className="dash-loading">Đang tải...</p> : (
            <BarChart
              items={topViewed.map((s) => ({
                label: s.full_name,
                value: s.view_count,
                sub: s.nickname ? ` · ${s.nickname}` : null,
              }))}
              max={maxViews}
            />
          )}
          <button
            type="button"
            className="dash-link-btn"
            onClick={() => navigate('/admin/students')}
          >
            Xem tất cả học sinh →
          </button>
        </section>

        {/* ── Reactions ── */}
        <section className="dash-panel">
          <h3 className="dash-panel-title">❤️ Tổng reactions — {stats?.reactions.total ?? 0}</h3>
          {loading && !stats ? <p className="dash-loading">Đang tải...</p> : (
            <div className="dash-reaction-grid">
              {REACTION_ORDER.map((key) => {
                const count = reactions[key] || 0
                const emoji = EMOJI_MAP[key]
                const total = stats?.reactions.total || 1
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={key} className="dash-reaction-item">
                    <span className="dash-reaction-emoji">{emoji}</span>
                    <div className="dash-reaction-bar-track">
                      <div className="dash-reaction-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="dash-reaction-num">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Quick links ── */}
      <div className="admin-quick-links">
        <Link to="/admin/students">Quản lý học sinh</Link>
        <Link to="/admin/gallery">Tải ảnh lên</Link>
        <Link to="/admin/letters">Duyệt lời chúc</Link>
      </div>
    </section>
  )
}

export default Dashboard
