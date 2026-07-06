import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'

function Dashboard() {
  const [stats, setStats] = useState({
    students: 0,
    active: 0,
    pending: 0,
    images: 0,
    withoutImages: 0,
  })
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadStats() {
      try {
        const [students, letters] = await Promise.all([
          adminApi.listStudents(),
          adminApi.listLetters({ status: 'pending', pageSize: 1 }),
        ])
        const galleries = await Promise.all(
          students.map((student) => adminApi.listGallery(student.id).catch(() => [])),
        )
        if (cancelled) return
        setStats({
          students: students.length,
          active: students.filter((student) => student.is_active).length,
          pending: letters.pagination.total,
          images: galleries.reduce((total, gallery) => total + gallery.length, 0),
          withoutImages: galleries.filter((gallery) => gallery.length === 0).length,
        })
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    loadStats()
    return () => { cancelled = true }
  }, [])

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Tổng quan</p>
          <h2>Bảng điều khiển</h2>
        </div>
      </header>
      {error && <p className="admin-alert error" role="alert">{error}</p>}
      <div className="admin-stats">
        <Link to="/admin/students"><strong>{stats.students}</strong><span>Tổng học sinh</span></Link>
        <Link to="/admin/students"><strong>{stats.active}</strong><span>Đang hoạt động</span></Link>
        <Link to="/admin/letters"><strong>{stats.pending}</strong><span>Lời chúc chờ duyệt</span></Link>
        <Link to="/admin/gallery"><strong>{stats.images}</strong><span>Tổng ảnh</span></Link>
        <Link to="/admin/gallery"><strong>{stats.withoutImages}</strong><span>Học sinh chưa có ảnh</span></Link>
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
