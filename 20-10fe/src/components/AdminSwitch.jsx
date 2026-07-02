import { Link, useLocation } from 'react-router-dom'

function AdminSwitch() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/admin')) return null
  return <Link className="admin-switch" to="/admin/login" aria-label="Chuyển sang chế độ quản trị">⚙ Quản trị</Link>
}

export default AdminSwitch
