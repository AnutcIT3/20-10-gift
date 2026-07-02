import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../api/adminApi'

function LetterManager() {
  const [students, setStudents] = useState([])
  const [status, setStatus] = useState('pending')
  const [studentId, setStudentId] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: { total: 0, totalPages: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { adminApi.listStudents().then(setStudents).catch((err) => setError(err.message)) }, [])
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await adminApi.listLetters({ status, studentId, page })); setError('') }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [status, studentId, page])
  useEffect(() => {
    let cancelled = false
    adminApi.listLetters({ status, studentId, page })
      .then((result) => { if (!cancelled) { setData(result); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, studentId, page])

  const changeStatus = async (id, nextStatus) => {
    try { await adminApi.updateLetterStatus(id, nextStatus); await load() }
    catch (err) { setError(err.message) }
  }
  const remove = async (id) => {
    if (!window.confirm('Xóa lời chúc này vĩnh viễn?')) return
    try { await adminApi.deleteLetter(id); await load() } catch (err) { setError(err.message) }
  }

  return (
    <section>
      <header className="admin-page-header"><div><p className="admin-kicker">Letters</p><h2>Duyệt lời chúc</h2></div><span>{data.pagination.total} kết quả</span></header>
      <div className="admin-panel admin-filters">
        <label>Trạng thái<select value={status} onChange={(e) => { setLoading(true); setStatus(e.target.value); setPage(1) }}><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Đã từ chối</option></select></label>
        <label>Học sinh<select value={studentId} onChange={(e) => { setLoading(true); setStudentId(e.target.value); setPage(1) }}><option value="">Tất cả</option>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></label>
      </div>
      {error && <p className="admin-alert error">{error}</p>}
      {loading ? <p>Đang tải...</p> : data.items.length ? <div className="admin-letter-list">{data.items.map((letter) => <article key={letter.id} className="admin-panel admin-letter-card">
        <header><div><strong>{letter.student_name}</strong><span>Từ: {letter.is_anonymous || !letter.sender_name ? 'Ẩn danh' : letter.sender_name}</span></div><span className={`admin-badge ${letter.status}`}>{letter.status}</span></header>
        {letter.title && <h3>{letter.title}</h3>}<p>{letter.content}</p><small>{new Date(letter.created_at).toLocaleString('vi-VN')}</small>
        <div className="admin-row-actions">{letter.status !== 'approved' && <button className="approve" onClick={() => changeStatus(letter.id, 'approved')}>Duyệt</button>}{letter.status !== 'rejected' && <button onClick={() => changeStatus(letter.id, 'rejected')}>Từ chối</button>}<button className="danger" onClick={() => remove(letter.id)}>Xóa</button></div>
      </article>)}</div> : <div className="admin-empty">Không có lời chúc phù hợp.</div>}
      <div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page}/{Math.max(data.pagination.totalPages, 1)}</span><button disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button></div>
    </section>
  )
}

export default LetterManager
