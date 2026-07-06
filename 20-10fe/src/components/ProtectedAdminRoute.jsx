import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { adminApi, adminAuth } from '../api/adminApi'

function ProtectedAdminRoute() {
  const location = useLocation()
  const token = adminAuth.getToken()
  const [status, setStatus] = useState(token ? 'checking' : 'missing')

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    adminApi.verifySession()
      .then(() => { if (!cancelled) setStatus('valid') })
      .catch(() => {
        adminAuth.clear()
        if (!cancelled) setStatus('missing')
    })
    return () => { cancelled = true }
  }, [location.pathname, token])

  if (!token) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }

  if (status === 'checking') {
    return <div className="app-route-loading" role="status">Đang kiểm tra phiên đăng nhập...</div>
  }

  if (status !== 'valid') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export default ProtectedAdminRoute
