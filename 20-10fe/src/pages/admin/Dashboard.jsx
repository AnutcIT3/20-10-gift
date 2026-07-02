import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'

function Dashboard() {
  const [stats, setStats] = useState({ students: 0, active: 0, pending: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([adminApi.listStudents(), adminApi.listLetters({ status: 'pending', pageSize: 1 })])
      .then(([students, letters]) => {
        if (!cancelled) setStats({
          students: students.length,
          active: students.filter((student) => student.is_active).length,
          pending: letters.pagination.total,
        })
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  return (
    <section>
      <header className="admin-page-header"><div><p className="admin-kicker">Dashboard</p><h2>Tổng quan</h2></div></header>
      {error && <p className="admin-alert error">{error}</p>}
      <div className="admin-stats">
        <article><strong>{stats.students}</strong><span>Tổng học sinh</span></article>
        <article><strong>{stats.active}</strong><span>Đang hoạt động</span></article>
        <article><strong>{stats.pending}</strong><span>Lời chúc chờ duyệt</span></article>
      </div>
      <div className="admin-quick-links">
        <Link to="/admin/students">Quản lý học sinh</Link>
        <Link to="/admin/gallery">Tải ảnh lên</Link>
        <Link to="/admin/letters">Duyệt lời chúc</Link>
      </div>
    </section>
  )
}

export default Dashboard
