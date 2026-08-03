import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'

const STATUSES = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Đã từ chối' },
]

const EMPTY_COMPOSE_FORM = {
  studentIds: [],
  senderName: 'Admin',
  isAnonymous: false,
  title: '',
  content: '',
  revealAt: '',
  status: 'approved',
}

const EMOJI_MAP = {
  smile: '🙂',
  laugh: '😄',
  angry: '😠',
  kiss: '😘',
  love: '😍',
  sad: '😞',
  thumbsup: '👍',
  think: '🤔',
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function computeRevealLimits() {
  const now = Date.now()
  return {
    min: new Date(now + 5 * 60 * 1000).toISOString().slice(0, 16),
    max: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  }
}

function ReactionSummary({ reactions = {} }) {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0)
  if (!entries.length) return null
  const total = entries.reduce((sum, [, value]) => sum + value, 0)
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

function selectedOptions(event) {
  return Array.from(event.target.selectedOptions).map((option) => Number(option.value))
}

function LetterManager() {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const initStudentId = searchParams.get('studentId') || ''
  const initStatus = searchParams.get('status') || 'pending'

  const [students, setStudents] = useState([])
  const [status, setStatus] = useState(initStatus)
  const [studentId, setStudentId] = useState(initStudentId)
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: { total: 0, totalPages: 0 } })
  const [selectedLetter, setSelectedLetter] = useState(null)
  const [editingLetter, setEditingLetter] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [composeForm, setComposeForm] = useState(EMPTY_COMPOSE_FORM)
  const [revealLimits] = useState(computeRevealLimits)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const activeStudents = useMemo(
    () => students.filter((student) => student.is_active !== false),
    [students],
  )

  useEffect(() => {
    adminApi.listStudents().then(setStudents).catch((err) => setError(err.message))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminApi.listLetters({ status, studentId, page })
      setData(result)
      setSelectedIds((current) => current.filter((id) => result.items.some((letter) => letter.id === id)))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [status, studentId, page])

  useEffect(() => {
    let cancelled = false
    adminApi.listLetters({ status, studentId, page })
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setSelectedIds((current) => current.filter((id) => result.items.some((letter) => letter.id === id)))
          setError('')
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, studentId, page])

  const applyFilter = (newStatus, newStudentId) => {
    setLoading(true)
    setStatus(newStatus)
    setStudentId(newStudentId)
    setPage(1)
    setSelectedIds([])
    const params = new URLSearchParams()
    if (newStatus) params.set('status', newStatus)
    if (newStudentId) params.set('studentId', newStudentId)
    navigate(`/admin/letters${params.toString() ? `?${params}` : ''}`, { replace: true })
  }

  const buildPayload = (form) => ({
    student_id: form.studentId ? Number(form.studentId) : undefined,
    student_ids: form.studentIds,
    sender_name: form.isAnonymous ? null : form.senderName.trim(),
    title: form.title.trim() || null,
    content: form.content.trim(),
    is_anonymous: form.isAnonymous,
    reveal_at: form.revealAt || null,
    status: form.status,
  })

  const submitCompose = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = buildPayload(composeForm)
      if (!payload.student_ids.length) throw new Error('Chọn ít nhất một người nhận.')
      await adminApi.createLetters(payload)
      setComposeForm(EMPTY_COMPOSE_FORM)
      setMessage(`Đã gửi lời chúc cho ${payload.student_ids.length} người nhận.`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (id, nextStatus) => {
    try {
      await adminApi.updateLetterStatus(id, nextStatus)
      setMessage('Đã cập nhật trạng thái.')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const bulkChangeStatus = async (nextStatus) => {
    if (!selectedIds.length) return
    try {
      await adminApi.bulkUpdateLetterStatus(selectedIds, nextStatus)
      setMessage(`Đã cập nhật ${selectedIds.length} lời chúc.`)
      setSelectedIds([])
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (id) => {
    try {
      await adminApi.deleteLetter(id)
      setMessage('Đã xóa lời chúc.')
      await load()
      setSelectedLetter(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const bulkRemove = async () => {
    if (!selectedIds.length) return
    const ok = window.confirm(`Xóa vĩnh viễn ${selectedIds.length} lời chúc đã chọn?`)
    if (!ok) return
    try {
      await adminApi.bulkDeleteLetters(selectedIds)
      setMessage(`Đã xóa ${selectedIds.length} lời chúc.`)
      setSelectedIds([])
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = (letter) => {
    setEditingLetter(letter)
    setEditForm({
      studentId: String(letter.student_id),
      senderName: letter.sender_name || '',
      isAnonymous: Boolean(letter.is_anonymous || !letter.sender_name),
      title: letter.title || '',
      content: letter.content || '',
      revealAt: toDateTimeLocal(letter.reveal_at),
      status: letter.status || 'pending',
    })
  }

  const submitEdit = async (event) => {
    event.preventDefault()
    if (!editingLetter || !editForm) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await adminApi.updateLetter(editingLetter.id, buildPayload(editForm))
      setMessage('Đã lưu chỉnh sửa lời chúc.')
      setEditingLetter(null)
      setEditForm(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleSelected = (id) => {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const allVisibleSelected = data.items.length > 0 && data.items.every((letter) => selectedIds.includes(letter.id))
  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !data.items.some((letter) => letter.id === id)))
      return
    }
    setSelectedIds((current) => [...new Set([...current, ...data.items.map((letter) => letter.id)])])
  }

  const selectedStudentName = studentId
    ? students.find((student) => String(student.id) === String(studentId))?.full_name || ''
    : ''

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Lời chúc</p>
          <h2>Quản lý lời chúc{selectedStudentName ? ` - ${selectedStudentName}` : ''}</h2>
        </div>
        <span>{data.pagination.total} kết quả</span>
      </header>

      <form className="admin-panel admin-form-grid" onSubmit={submitCompose}>
        <h3>Gửi lời chúc từ admin</h3>
        <label className="admin-span-2">
          Người nhận
          <select
            multiple
            className="admin-multi-select"
            value={composeForm.studentIds.map(String)}
            onChange={(event) => setComposeForm({ ...composeForm, studentIds: selectedOptions(event) })}
          >
            {activeStudents.map((student) => (
              <option key={student.id} value={student.id}>{student.full_name}</option>
            ))}
          </select>
        </label>
        <div className="admin-span-2 admin-inline-actions">
          <button
            type="button"
            onClick={() => setComposeForm({ ...composeForm, studentIds: activeStudents.map((student) => student.id) })}
          >
            Chọn tất cả người đang hoạt động
          </button>
          <button type="button" onClick={() => setComposeForm({ ...composeForm, studentIds: [] })}>Bỏ chọn</button>
          <span>{composeForm.studentIds.length} người nhận</span>
        </div>
        <fieldset className="admin-fieldset">
          <legend>Người gửi</legend>
          <label><input type="radio" checked={!composeForm.isAnonymous} onChange={() => setComposeForm({ ...composeForm, isAnonymous: false })} /> Hiện tên</label>
          <label><input type="radio" checked={composeForm.isAnonymous} onChange={() => setComposeForm({ ...composeForm, isAnonymous: true, senderName: '' })} /> Ẩn danh</label>
        </fieldset>
        {!composeForm.isAnonymous && (
          <label>Tên người gửi<input maxLength={100} value={composeForm.senderName} onChange={(event) => setComposeForm({ ...composeForm, senderName: event.target.value })} /></label>
        )}
        <label>Trạng thái
          <select value={composeForm.status} onChange={(event) => setComposeForm({ ...composeForm, status: event.target.value })}>
            {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Hiện lúc
          <input type="datetime-local" value={composeForm.revealAt} min={revealLimits.min} max={revealLimits.max} onChange={(event) => setComposeForm({ ...composeForm, revealAt: event.target.value })} />
        </label>
        <label className="admin-span-2">Tiêu đề<input maxLength={200} value={composeForm.title} onChange={(event) => setComposeForm({ ...composeForm, title: event.target.value })} /></label>
        <label className="admin-span-2">Nội dung<textarea required maxLength={5000} value={composeForm.content} onChange={(event) => setComposeForm({ ...composeForm, content: event.target.value })} /></label>
        <div className="admin-form-actions admin-span-2">
          <button className="admin-primary" disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi lời chúc'}</button>
        </div>
      </form>

      <div className="admin-panel admin-filters">
        <div className="admin-tabs" role="tablist" aria-label="Lọc trạng thái lời chúc">
          {STATUSES.map((item) => (
            <button key={item.value} type="button" className={status === item.value ? 'active' : ''} onClick={() => applyFilter(item.value, studentId)}>
              {item.label}
            </button>
          ))}
        </div>
        <label>
          Học sinh
          <select value={studentId} onChange={(event) => applyFilter(status, event.target.value)}>
            <option value="">Tất cả</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.full_name}</option>
            ))}
          </select>
        </label>
      </div>

      {selectedIds.length > 0 && (
        <div className="admin-panel admin-bulk-bar">
          <strong>{selectedIds.length} lời chúc đã chọn</strong>
          <button type="button" className="approve" onClick={() => bulkChangeStatus('approved')}>Duyệt hàng loạt</button>
          <button type="button" onClick={() => bulkChangeStatus('rejected')}>Từ chối hàng loạt</button>
          <button type="button" className="danger" onClick={bulkRemove}>Xóa hàng loạt</button>
          <button type="button" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
        </div>
      )}

      {message && <p className="admin-alert success" role="status">{message}</p>}
      {error && <p className="admin-alert error" role="alert">{error}</p>}

      {loading ? <p>Đang tải...</p> : data.items.length ? (
        <div className="admin-letter-list">
          <label className="admin-select-all">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
            Chọn tất cả trên trang này
          </label>
          {data.items.map((letter) => (
            <article key={letter.id} className="admin-panel admin-letter-card">
              <header>
                <label className="admin-letter-select">
                  <input type="checkbox" checked={selectedIds.includes(letter.id)} onChange={() => toggleSelected(letter.id)} />
                  <span>
                    <strong>{letter.student_name}</strong>
                    <small>Từ: {letter.is_anonymous || !letter.sender_name ? 'Ẩn danh' : letter.sender_name}</small>
                  </span>
                </label>
                <span className={`admin-badge ${letter.status}`}>
                  {STATUSES.find((item) => item.value === letter.status)?.label || letter.status}
                </span>
              </header>
              {letter.title && <h3>{letter.title}</h3>}
              <p>{letter.content}</p>
              {letter.reveal_at && (
                <div className="admin-reveal-chip">
                  Hiện lúc {new Date(letter.reveal_at).toLocaleString('vi-VN')}
                </div>
              )}
              <ReactionSummary reactions={letter.reactions} />
              <small>{new Date(letter.created_at).toLocaleString('vi-VN')}</small>
              <div className="admin-row-actions">
                <button type="button" onClick={() => setSelectedLetter(letter)}>Xem đầy đủ</button>
                <button type="button" onClick={() => startEdit(letter)}>Sửa</button>
                {letter.status !== 'approved' && <button type="button" className="approve" onClick={() => changeStatus(letter.id, 'approved')}>Duyệt nhanh</button>}
                {letter.status !== 'rejected' && <button type="button" onClick={() => changeStatus(letter.id, 'rejected')}>Từ chối</button>}
                <button type="button" className="danger" onClick={() => setSelectedLetter({ ...letter, confirmDelete: true })}>Xóa</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">Không có lời chúc phù hợp.</div>
      )}

      <div className="admin-pagination">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button>
        <span>Trang {page}/{Math.max(data.pagination.totalPages, 1)}</span>
        <button type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button>
      </div>

      {editingLetter && editForm && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setEditingLetter(null)}>
          <section className="admin-modal large" role="dialog" aria-modal="true" aria-labelledby="letter-edit-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="letter-edit-title">Sửa lời chúc</h3>
            <form className="admin-form-grid" onSubmit={submitEdit}>
              <label className="admin-span-2">Người nhận
                <select value={editForm.studentId} onChange={(event) => setEditForm({ ...editForm, studentId: event.target.value })}>
                  {activeStudents.map((student) => (
                    <option key={student.id} value={student.id}>{student.full_name}</option>
                  ))}
                </select>
              </label>
              <fieldset className="admin-fieldset">
                <legend>Người gửi</legend>
                <label><input type="radio" checked={!editForm.isAnonymous} onChange={() => setEditForm({ ...editForm, isAnonymous: false })} /> Hiện tên</label>
                <label><input type="radio" checked={editForm.isAnonymous} onChange={() => setEditForm({ ...editForm, isAnonymous: true, senderName: '' })} /> Ẩn danh</label>
              </fieldset>
              {!editForm.isAnonymous && <label>Tên người gửi<input maxLength={100} value={editForm.senderName} onChange={(event) => setEditForm({ ...editForm, senderName: event.target.value })} /></label>}
              <label>Trạng thái
                <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>Hiện lúc
                <input type="datetime-local" value={editForm.revealAt} onChange={(event) => setEditForm({ ...editForm, revealAt: event.target.value })} />
              </label>
              <label className="admin-span-2">Tiêu đề<input maxLength={200} value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></label>
              <label className="admin-span-2">Nội dung<textarea required maxLength={5000} value={editForm.content} onChange={(event) => setEditForm({ ...editForm, content: event.target.value })} /></label>
              <div className="admin-form-actions admin-span-2">
                <button className="admin-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}</button>
                <button type="button" onClick={() => { setEditingLetter(null); setEditForm(null) }}>Hủy</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedLetter && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setSelectedLetter(null)}>
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
                  <button type="button" onClick={() => { startEdit(selectedLetter); setSelectedLetter(null) }}>Sửa</button>
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
