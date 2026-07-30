import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'

const STATUSES = [
  { value: 'pending',  label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Đã từ chối' },
]

// Tất cả emoji phải khớp với REACTIONS bên LetterSection
const EMOJI_MAP = {
  smile:    '🙂',
  laugh:    '😄',
  angry:    '😠',
  kiss:     '😘',
  love:     '😍',
  sad:      '😞',
  thumbsup: '👍',
  think:    '🤔',
}

function ReactionSummary({ reactions = {} }) {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0)
  if (!entries.length) return null
  const total = entries.reduce((s, [, v]) => s + v, 0)
  return (
    <div className="admin-reactions">
      {entries.map(([key, count]) => (
        <span key={key} className="admin-reaction-chip" title={key}>
          {EMOJI_MAP[key] || key} {count}
        </span>
      ))}
      <span className="admin-reaction-total">{total} cảm xúc</span>
    </div>
  )
}

function LetterManager() {
  const navigate = useNavigate()
  const location = useLocation()

  // Đọc studentId từ URL search params (từ StudentManager navigate sang)
  const searchParams = new URLSearchParams(location.search)
  const initStudentId = searchParams.get('studentId') || ''
  const initStatus   = searchParams.get('status')    || 'pending'

  const [students, setStudents]       = useState([])
  const [status, setStatus]           = useState(initStatus)
  const [studentId, setStudentId]     = useState(initStudentId)
  const [page, setPage]               = useState(1)
  const [data, setData]               = useState({ items: [], pagination: { total: 0, totalPages: 0 } })
  const [selectedLetter, setSelected] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  useEffect(() => {
    adminApi.listStudents().then(setStudents).catch((err) => setError(err.message))
  }, [])

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
      .catch((err)   => { if (!cancelled) setError(err.message) })
      .finally(()    => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, studentId, page])

  // Sync URL params khi filter thay đổi
  const applyFilter = (newStatus, newStudentId) => {
    setLoading(true)
    setStatus(newStatus)
    setStudentId(newStudentId)
    setPage(1)
    const params = new URLSearchParams()
    if (newStatus)    params.set('status',    newStatus)
    if (newStudentId) params.set('studentId', newStudentId)
    navigate(`/admin/letters${params.toString() ? '?' + params : ''}`, { replace: true })
  }

  const changeStatus = async (id, nextStatus) => {
    try { await adminApi.updateLetterStatus(id, nextStatus); await load() }
    catch (err) { setError(err.message) }
  }
  const remove = async (id) => {
    try { await adminApi.deleteLetter(id); await load(); setSelected(null) }
    catch (err) { setError(err.message) }
  }

  const selectedStudentName = studentId
    ? students.find((s) => String(s.id) === String(studentId))?.full_name || ''
    : ''

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Lời chúc</p>
          <h2>Duyệt lời chúc{selectedStudentName ? ` — ${selectedStudentName}` : ''}</h2>
        </div>
        <span>{data.pagination.total} kết quả</span>
      </header>

      <div className="admin-panel admin-filters">
        <div className="admin-tabs" role="tablist" aria-label="Lọc trạng thái lời chúc">
          {STATUSES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={status === item.value ? 'active' : ''}
              onClick={() => applyFilter(item.value, studentId)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label>
          Học sinh
          <select
            value={studentId}
            onChange={(e) => applyFilter(status, e.target.value)}
          >
            <option value="">Tất cả</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.full_name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="admin-alert error" role="alert">{error}</p>}

      {loading ? <p>Đang tải...</p> : data.items.length ? (
        <div className="admin-letter-list">
          {data.items.map((letter) => (
            <article key={letter.id} className="admin-panel admin-letter-card">
              <header>
                <div>
                  <strong>{letter.student_name}</strong>
                  <span>Từ: {letter.is_anonymous || !letter.sender_name ? 'Ẩn danh' : letter.sender_name}</span>
                </div>
                <span className={`admin-badge ${letter.status}`}>
                  {STATUSES.find((item) => item.value === letter.status)?.label || letter.status}
                </span>
              </header>
              {letter.title && <h3>{letter.title}</h3>}
              <p>{letter.content}</p>
              {letter.reveal_at && (
                <div className="admin-reveal-chip">
                  🔒 Hiện lúc {new Date(letter.reveal_at).toLocaleString('vi-VN')}
                </div>
              )}
              <ReactionSummary reactions={letter.reactions} />
              <small>{new Date(letter.created_at).toLocaleString('vi-VN')}</small>
              <div className="admin-row-actions">
                <button onClick={() => setSelected(letter)}>Xem đầy đủ</button>
                {letter.status !== 'approved' && <button className="approve" onClick={() => changeStatus(letter.id, 'approved')}>Duyệt nhanh</button>}
                {letter.status !== 'rejected' && <button onClick={() => changeStatus(letter.id, 'rejected')}>Từ chối</button>}
                <button className="danger" onClick={() => setSelected({ ...letter, confirmDelete: true })}>Xóa</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">Không có lời chúc phù hợp.</div>
      )}

      <div className="admin-pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button>
        <span>Trang {page}/{Math.max(data.pagination.totalPages, 1)}</span>
        <button disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button>
      </div>

      {selectedLetter && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <section className="admin-modal large" role="dialog" aria-modal="true" aria-labelledby="letter-modal-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="letter-modal-title">
              {selectedLetter.confirmDelete ? 'Xóa lời chúc' : (selectedLetter.title || 'Nội dung lời chúc')}
            </h3>
            <p className="admin-letter-full">{selectedLetter.content}</p>
            <small>
              Người nhận: {selectedLetter.student_name} · Người gửi: {selectedLetter.is_anonymous || !selectedLetter.sender_name ? 'Ẩn danh' : selectedLetter.sender_name}
            </small>
            {!selectedLetter.confirmDelete && (
              <div className="admin-modal-reactions">
                <strong>Cảm xúc nhận được:</strong>
                <ReactionSummary reactions={selectedLetter.reactions} />
                {!Object.values(selectedLetter.reactions || {}).some(Boolean) && (
                  <span className="admin-no-reactions">Chưa có cảm xúc nào</span>
                )}
              </div>
            )}
            <div className="admin-form-actions">
              {selectedLetter.confirmDelete ? (
                <button type="button" className="danger" onClick={() => remove(selectedLetter.id)}>Xóa vĩnh viễn</button>
              ) : (
                <>
                  {selectedLetter.status !== 'approved' && <button type="button" className="approve" onClick={() => changeStatus(selectedLetter.id, 'approved')}>Duyệt</button>}
                  {selectedLetter.status !== 'rejected' && <button type="button" onClick={() => changeStatus(selectedLetter.id, 'rejected')}>Từ chối</button>}
                </>
              )}
              <button type="button" onClick={() => setSelected(null)}>Đóng</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default LetterManager
