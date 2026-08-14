import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { adminApi, adminAuth } from '../../api/adminApi'
import '../../styles/admin.css'

function AdminLayout() {
  const navigate = useNavigate()
  const observedRevision = useRef(null)
  const [outletKey, setOutletKey] = useState(0)

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
          // Chỉ remount khi revision MỚI HƠN: response poll cũ về muộn sau khi
          // đã adopt revision từ mutation của chính mình sẽ bị bỏ qua
          observedRevision.current = revision
          setOutletKey((key) => key + 1)
        }
      } catch {
        // A temporary network failure should not interrupt the current admin task.
      } finally {
        polling = false
      }
    }

    pollRevision()
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
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('gift-admin-revision', handleSelfRevision)
    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('gift-admin-revision', handleSelfRevision)
    }
  }, [])

  const logout = () => {
    adminAuth.clear()
    navigate('/', { replace: true })
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div><p className="admin-kicker">20/10 Gift</p><h1>Quản trị</h1></div>
        <nav aria-label="Điều hướng quản trị">
          <NavLink end to="/admin">Tổng quan</NavLink>
          <NavLink to="/admin/students">Học sinh</NavLink>
          <NavLink to="/admin/seating">Sơ đồ lớp</NavLink>
          <NavLink to="/admin/gallery">Thư viện ảnh</NavLink>
          <NavLink to="/admin/letters">Lời chúc</NavLink>
        </nav>
        <button type="button" className="admin-logout" onClick={logout}>Đăng xuất</button>
      </aside>
      <main className="admin-main"><Outlet key={outletKey} /></main>
    </div>
  )
}

export default AdminLayout
