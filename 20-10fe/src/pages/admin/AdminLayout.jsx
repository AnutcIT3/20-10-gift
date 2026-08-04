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
      if (polling) return
      polling = true
      try {
        const data = await adminApi.getDataRevision()
        if (stopped) return
        const revision = Number(data.revision)
        if (observedRevision.current === null) {
          observedRevision.current = revision
        } else if (observedRevision.current !== revision) {
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
    return () => {
      stopped = true
      clearInterval(interval)
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
