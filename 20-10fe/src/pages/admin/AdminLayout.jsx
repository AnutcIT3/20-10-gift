import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { adminAuth } from '../../api/adminApi'
import '../../styles/admin.css'

function AdminLayout() {
  const navigate = useNavigate()
  const logout = () => {
    adminAuth.clear()
    navigate('/admin/login', { replace: true })
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div><p className="admin-kicker">20/10 Gift</p><h1>Quản trị</h1></div>
        <nav aria-label="Điều hướng quản trị">
          <NavLink end to="/admin">Tổng quan</NavLink>
          <NavLink to="/admin/students">Học sinh</NavLink>
          <NavLink to="/admin/gallery">Thư viện ảnh</NavLink>
          <NavLink to="/admin/letters">Lời chúc</NavLink>
        </nav>
        <button type="button" className="admin-logout" onClick={logout}>Đăng xuất</button>
      </aside>
      <main className="admin-main"><Outlet /></main>
    </div>
  )
}

export default AdminLayout
