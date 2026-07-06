import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { adminApi, adminAuth } from '../../api/adminApi'
import '../../styles/admin.css'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (adminAuth.getToken()) return <Navigate to="/admin" replace />

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await adminApi.login(form.username.trim(), form.password)
      adminAuth.setToken(token)
      navigate(location.state?.from || '/admin', { replace: true })
    } catch (err) {
      setError(err.status === 401 ? 'Sai tên đăng nhập hoặc mật khẩu' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-login-page">
      <form className="admin-login-card" onSubmit={submit}>
        <p className="admin-kicker">20/10 Gift</p>
        <h1>Đăng nhập quản trị</h1>
        <label htmlFor="admin-username">Tên đăng nhập</label>
        <input id="admin-username" autoComplete="username" required value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })} />
        <label htmlFor="admin-password">Mật khẩu</label>
        <input id="admin-password" type="password" autoComplete="current-password" required value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })} />
        {error && <p className="admin-alert error">{error}</p>}
        <button type="submit" className="admin-primary" disabled={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  )
}

export default LoginPage
