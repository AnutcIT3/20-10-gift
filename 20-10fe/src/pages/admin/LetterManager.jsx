import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../api/adminApi'

const STATUSES = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Đã từ chối' },
]

function LetterManager() {
  const [students, setStudents] = useState([])
  const [status, setStatus] = useState('pending')
  const [studentId, setStudentId] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: { total: 0, totalPages: 0 } })
  const [selectedLetter, setSelectedLetter] = useState(null)
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
    try { await adminApi.deleteLetter(id); await load(); setSelectedLetter(null) } catch (err) { setError(err.message) }
  }

  return (
    <section>
      <header className="admin-page-header"><div><p className="admin-kicker">Lời chúc</p><h2>Duyệt lời chúc</h2></div><span>{data.pagination.total} kết quả</span></header>
      <div className="admin-panel admin-filters">
        <div className="admin-tabs" role="tablist" aria-label="Lọc trạng thái lời chúc">
          {STATUSES.map((item) => <button key={item.value} type="button" className={status === item.value ? 'active' : ''} onClick={() => { setLoading(true); setStatus(item.value); setPage(1) }}>{item.label}</button>)}
        </div>
        <label>Học sinh<select value={studentId} onChange={(e) => { setLoading(true); setStudentId(e.target.value); setPage(1) }}><option value="">Tất cả</option>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></label>
      </div>
      {error && <p className="admin-alert error" role="alert">{error}</p>}
      {loading ? <p>Đang tải...</p> : data.items.length ? <div className="admin-letter-list">{data.items.map((letter) => <article key={letter.id} className="admin-panel admin-letter-card">
        <header><div><strong>{letter.student_name}</strong><span>Từ: {letter.is_anonymous || !letter.sender_name ? 'Ẩn danh' : letter.sender_name}</span></div><span className={`admin-badge ${letter.status}`}>{STATUSES.find((item) => item.value === letter.status)?.label || letter.status}</span></header>
        {letter.title && <h3>{letter.title}</h3>}<p>{letter.content}</p><small>{new Date(letter.created_at).toLocaleString('vi-VN')}</small>
        <div className="admin-row-actions"><button onClick={() => setSelectedLetter(letter)}>Xem đầy đủ</button>{letter.status !== 'approved' && <button className="approve" onClick={() => changeStatus(letter.id, 'approved')}>Duyệt nhanh</button>}{letter.status !== 'rejected' && <button onClick={() => changeStatus(letter.id, 'rejected')}>Từ chối</button>}<button className="danger" onClick={() => setSelectedLetter({ ...letter, confirmDelete: true })}>Xóa</button></div>
      </article>)}</div> : <div className="admin-empty">Không có lời chúc phù hợp.</div>}
      <div className="admin-pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page}/{Math.max(data.pagination.totalPages, 1)}</span><button disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button></div>
      {selectedLetter && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setSelectedLetter(null)}>
          <section className="admin-modal large" role="dialog" aria-modal="true" aria-labelledby="letter-modal-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="letter-modal-title">{selectedLetter.confirmDelete ? 'Xóa lời chúc' : (selectedLetter.title || 'Nội dung lời chúc')}</h3>
            <p className="admin-letter-full">{selectedLetter.content}</p>
            <small>Người nhận: {selectedLetter.student_name} · Người gửi: {selectedLetter.is_anonymous || !selectedLetter.sender_name ? 'Ẩn danh' : selectedLetter.sender_name}</small>
            <div className="admin-form-actions">
              {selectedLetter.confirmDelete ? (
                <button type="button" className="danger" onClick={() => remove(selectedLetter.id)}>Xóa vĩnh viễn</button>
              ) : (
                <>
                  {selectedLetter.status !== 'approved' && <button type="button" className="approve" onClick={() => changeStatus(selectedLetter.id, 'approved')}>Duyệt</button>}
                  {selectedLetter.status !== 'rejected' && <button type="button" onClick={() => changeStatus(selectedLetter.id, 'rejected')}>Từ chối</button>}
                </>
              )}
              <button type="button" onClick={() => setSelectedLetter(null)}>Đóng</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default LetterManager
