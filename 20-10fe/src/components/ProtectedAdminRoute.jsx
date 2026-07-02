import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { adminAuth } from '../api/adminApi'

function ProtectedAdminRoute() {
  const location = useLocation()
  if (!adminAuth.getToken()) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

export default ProtectedAdminRoute
