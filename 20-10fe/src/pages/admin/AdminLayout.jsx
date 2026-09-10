import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { adminApi, adminAuth } from '../../api/adminApi'
import { CLASS_NAME } from '../../lib/event'
import '../../styles/admin.css'

function AdminLayout() {
  const navigate = useNavigate()
  const observedRevision = useRef(null)
  const [outletKey, setOutletKey] = useState(0)
  // Có thay đổi từ thiết bị khác nhưng CHƯA tải lại: remount tự động sẽ xóa
  // hàng đợi ảnh đang chờ tải, chú thích đang gõ, form đang sửa — trong một
  // buổi tải 100 ảnh, chỉ cần một bạn gửi lời chúc là mất sạch. Để admin bấm.
  const [stale, setStale] = useState(false)
  // Sidebar: số lời chúc chờ duyệt (badge) và trạng thái khóa trang quà
  const [sidebar, setSidebar] = useState({ pending: null, locked: null })
  const [lockSaving, setLockSaving] = useState(false)
  const [lockError, setLockError] = useState('')

  const loadSidebar = useCallback(async () => {
    try {
      const [stats, settings] = await Promise.all([adminApi.getStats(), adminApi.getSettings()])
      setSidebar({
        pending: Number(stats?.letters?.pending ?? 0),
        locked: Boolean(settings?.gift_pages_locked),
      })
    } catch {
      // Giữ giá trị cũ — badge/khóa lệch vài giây không đáng chặn thao tác
    }
  }, [])

  useEffect(() => {
    let stopped = false
    let polling = false

    const pollRevision = async () => {
      // Tab ẩn thì không poll để tiết kiệm request — trừ lượt seed đầu tiên:
      // thiếu seed thì lần poll khi focus lại sẽ nuốt thay đổi thay vì remount
      if (polling || (document.hidden && observedRevision.current !== null)) return
      polling = true
      try {
        const data = await adminApi.getDataRevision()
        if (stopped) return
        const revision = Number(data.revision)
        if (observedRevision.current === null) {
          observedRevision.current = revision
        } else if (revision > observedRevision.current) {
          // Chỉ báo khi revision MỚI HƠN: response poll cũ về muộn sau khi
          // đã adopt revision từ mutation của chính mình sẽ bị bỏ qua.
          // Sidebar (badge, khóa) vẫn tự cập nhật; trang con chờ admin bấm.
          observedRevision.current = revision
          setStale(true)
          loadSidebar()
        }
      } catch {
        // A temporary network failure should not interrupt the current admin task.
      } finally {
        polling = false
      }
    }

    pollRevision()
    // setTimeout 0 để setState không chạy đồng bộ trong effect (react-hooks v7)
    const initialSidebar = setTimeout(loadSidebar, 0)
    const interval = setInterval(pollRevision, 5000)
    const handleVisibility = () => {
      // Quay lại tab thì poll ngay để bắt kịp thay đổi trong lúc vắng mặt
      if (!document.hidden) pollRevision()
    }
    // Mutation của chính thiết bị này: adopt revision mới mà không remount —
    // trang vừa thao tác đã tự cập nhật dữ liệu của nó rồi. CHỈ adopt khi
    // revision tăng đúng 1 bước; nhảy ≥2 nghĩa là có thay đổi của thiết bị
    // khác lẫn vào, phải để poll remount kẻo nuốt mất thay đổi đó vĩnh viễn.
    const handleSelfRevision = (event) => {
      const revision = Number(event.detail?.revision)
      if (!Number.isFinite(revision)) return
      if (observedRevision.current === null || revision === observedRevision.current + 1) {
        observedRevision.current = revision
      }
      loadSidebar()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('gift-admin-revision', handleSelfRevision)
    return () => {
      stopped = true
      clearTimeout(initialSidebar)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('gift-admin-revision', handleSelfRevision)
    }
  }, [loadSidebar])

  const toggleLock = async () => {
    if (sidebar.locked === null || lockSaving) return
    setLockSaving(true)
    setLockError('')
    try {
      const updated = await adminApi.updateSettings({ gift_pages_locked: !sidebar.locked })
      setSidebar((current) => ({ ...current, locked: Boolean(updated?.gift_pages_locked) }))
    } catch (err) {
      setLockError(err.message)
    } finally {
      setLockSaving(false)
    }
  }

  const logout = () => {
    adminAuth.clear()
    navigate('/', { replace: true })
  }

  const locked = sidebar.locked
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src="/logoclass.jpg" alt="" />
          <div>
            <p>Quản trị · 20/10</p>
            <h1>Lớp {CLASS_NAME}</h1>
          </div>
        </div>
        {/* Thứ tự theo tần suất dùng: 2 trang dùng nhiều nhất (Lời chúc, Thư viện
            ảnh) phải nằm trong số tab hiện sẵn trên màn hình hẹp */}
        <nav aria-label="Điều hướng quản trị">
          <NavLink end to="/admin">Tổng quan</NavLink>
          <NavLink to="/admin/letters">
            Lời chúc
            {sidebar.pending > 0 && <span className="admin-nav-badge" aria-label={`${sidebar.pending} lời chúc chờ duyệt`}>{sidebar.pending}</span>}
          </NavLink>
          <NavLink to="/admin/gallery">Thư viện ảnh</NavLink>
          <NavLink to="/admin/students">Học sinh</NavLink>
          <NavLink to="/admin/seating">Sơ đồ lớp</NavLink>
        </nav>
        {/* Khóa/mở trang quà: giữ bất ngờ tới đúng ngày 20/10 — gửi lời chúc vẫn mở */}
        <div className="admin-lock">
          <div className="admin-lock__row">
            <span>Trang quà</span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(locked)}
              aria-label={locked ? 'Đang khóa trang quà — bấm để mở' : 'Trang quà đang mở — bấm để khóa chờ 20/10'}
              className={`admin-toggle${locked ? ' is-locked' : ''}`}
              disabled={locked === null || lockSaving}
              onClick={toggleLock}
            />
          </div>
          <p>
            {locked === null
              ? 'Đang kiểm tra trạng thái…'
              : locked
                ? <>Đang <b>KHÓA</b> chờ 20/10. Gửi lời chúc vẫn hoạt động.</>
                : <>Đang <b>MỞ</b> — mọi người xem được trang quà. Bật khóa để giữ bất ngờ.</>}
          </p>
        </div>
        <button type="button" className="admin-logout" onClick={logout}>Đăng xuất</button>
      </aside>
      <main className="admin-main">
        {stale && (
          <div className="admin-stale" role="status">
            <span>Có thay đổi mới từ thiết bị khác.</span>
            <button
              type="button"
              className="admin-btn admin-btn--sm admin-btn--primary"
              onClick={() => { setStale(false); setOutletKey((key) => key + 1) }}
            >
              Tải lại trang này
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setStale(false)}>Để sau</button>
          </div>
        )}
        <Outlet key={outletKey} />
      </main>
      {lockError && <p key={lockError} className="admin-alert error" role="alert">{lockError}</p>}
    </div>
  )
}

export default AdminLayout
