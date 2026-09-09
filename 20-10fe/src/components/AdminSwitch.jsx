import { Link, useLocation } from 'react-router-dom'

// Chỉ hiện ở trang chủ: header trang quà đã kín hai góc (Tìm tên khác / Chia sẻ),
// còn admin đã vào /admin một lần thì phiên được giữ trong sessionStorage
function AdminSwitch() {
  const { pathname } = useLocation()
  if (pathname !== '/') return null
  return <Link className="admin-switch" to="/admin/login" aria-label="Chuyển sang chế độ quản trị">⚙ Quản trị</Link>
}

export default AdminSwitch
