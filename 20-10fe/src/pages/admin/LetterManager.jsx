import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'
import useDialogA11y from '../../hooks/useDialogA11y'
import Polaroid from '../../components/paper/Polaroid'
import { formatStamp } from '../../lib/event'

const STATUSES = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'approved', label: 'Đã duyệt' },
  { value: 'rejected', label: 'Từ chối' },
]
// Tab "Hẹn giờ" là bộ lọc ảo (đã duyệt nhưng chưa tới giờ) — không phải trạng thái lưu
const TABS = [...STATUSES, { value: 'scheduled', label: 'Hẹn giờ' }]

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

function formatReveal(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function ReactionSummary({ reactions = {} }) {
  const entries = Object.entries(reactions).filter(([, count]) => count > 0)
  if (!entries.length) return null
  return (
    <div className="admin-reactions">
      {entries.map(([key, count]) => (
        <span key={key} className="admin-reaction-chip" title={key}>
          {EMOJI_MAP[key] || key} <b>{count}</b>
        </span>
      ))}
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
  const initSearch = searchParams.get('search') || ''

  const [students, setStudents] = useState([])
  const [status, setStatus] = useState(initStatus)
  const [studentId, setStudentId] = useState(initStudentId)
  const [search, setSearch] = useState(initSearch)
  const [searchInput, setSearchInput] = useState(initSearch)
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: { total: 0, totalPages: 0 } })
  const [counts, setCounts] = useState(null)
  const [selectedLetter, setSelectedLetter] = useState(null)
  const [editingLetter, setEditingLetter] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [composeForm, setComposeForm] = useState(EMPTY_COMPOSE_FORM)
  const [composeOpen, setComposeOpen] = useState(false)
  const [revealLimits] = useState(computeRevealLimits)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const activeStudents = useMemo(
    () => students.filter((student) => student.is_active !== false),
    [students],
  )

  const closeEdit = () => { setEditingLetter(null); setEditForm(null) }
  const closeDetail = () => setSelectedLetter(null)
  const editDialogRef = useDialogA11y(Boolean(editingLetter && editForm), closeEdit)
  const detailDialogRef = useDialogA11y(Boolean(selectedLetter), closeDetail)

  useEffect(() => {
    adminApi.listStudents().then(setStudents).catch((err) => setError(err.message))
  }, [])

  // Đánh số mỗi lượt load: response về muộn của filter/trang cũ bị bỏ,
  // không ghi đè danh sách của filter đang chọn
  const loadSeq = useRef(0)
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const [result, stats] = await Promise.all([
        adminApi.listLetters({ status, studentId, search, page }),
        adminApi.getStats().catch(() => null),
      ])
      if (seq !== loadSeq.current) return
      // Duyệt/xóa hết mục của trang cuối làm tổng số trang co lại — clamp về
      // trang hợp lệ, nếu không admin kẹt ở trang rỗng (pagination đã bị ẩn)
      const totalPages = Math.max(Number(result.pagination?.totalPages) || 1, 1)
      if (page > totalPages) {
        setPage(totalPages)
        return
      }
      setData(result)
      if (stats?.letters) setCounts(stats.letters)
      setSelectedIds((current) => current.filter((id) => result.items.some((letter) => letter.id === id)))
      setError('')
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(err.message)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [status, studentId, search, page])

  // setTimeout 0 để setState không chạy đồng bộ trong effect (react-hooks v7)
  useEffect(() => {
    const initial = setTimeout(load, 0)
    return () => clearTimeout(initial)
  }, [load])

  // URL là nguồn sự thật cho bộ lọc: đổi query (link từ Dashboard, nút back)
  // trong lúc trang đang mở cũng phải cập nhật tab lọc, không chỉ lúc mount
  useEffect(() => {
    const sync = setTimeout(() => {
      const params = new URLSearchParams(location.search)
      const nextStatus = params.get('status') || 'pending'
      const nextStudentId = params.get('studentId') || ''
      const nextSearch = params.get('search') || ''
      if (nextStatus !== status || nextStudentId !== studentId || nextSearch !== search) {
        setStatus(nextStatus)
        setStudentId(nextStudentId)
        setSearch(nextSearch)
        setSearchInput(nextSearch)
        setPage(1)
        setSelectedIds([])
      }
    }, 0)
    return () => clearTimeout(sync)
  }, [location.search, status, studentId, search])

  const applyFilter = useCallback((newStatus, newStudentId, newSearch = search) => {
    const params = new URLSearchParams()
    if (newStatus) params.set('status', newStatus)
    if (newStudentId) params.set('studentId', newStudentId)
    if (newSearch) params.set('search', newSearch)
    navigate(`/admin/letters${params.toString() ? `?${params}` : ''}`, { replace: true })
  }, [navigate, search])

  // Gõ tìm kiếm: chờ 350 ms rồi mới đẩy vào URL để không gọi API theo từng phím
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === search) return undefined
    const timer = setTimeout(() => applyFilter(status, studentId, trimmed), 350)
    return () => clearTimeout(timer)
  }, [searchInput, search, status, studentId, applyFilter])

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
      setComposeOpen(false)
      setMessage(`Đã gửi lời chúc cho ${payload.student_ids.length} người nhận.`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Các handler đều clear message/error TRƯỚC khi set lại: phần tử toast
  // unmount rồi mount lại nên animation fade chạy lại cho từng thông báo
  // (CSS animation không tự restart khi chỉ đổi text trên cùng một phần tử)
  const changeStatus = async (id, nextStatus) => {
    setMessage('')
    setError('')
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
    setMessage('')
    setError('')
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
    setMessage('')
    setError('')
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
    setMessage('')
    setError('')
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

  const tabCount = (value) => (counts && counts[value] !== undefined ? ` · ${counts[value]}` : '')

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Lời chúc</p>
          <h2>Hộp thư{selectedStudentName && <> · <span className="accent">{selectedStudentName}</span></>}</h2>
        </div>
        <div className="admin-header-actions">
          <div className="admin-tabs" role="group" aria-label="Lọc trạng thái lời chúc">
            {TABS.map((item) => (
              <button key={item.value} type="button" className={status === item.value ? 'active' : ''} aria-pressed={status === item.value} onClick={() => applyFilter(item.value, studentId)}>
                {item.label}{tabCount(item.value)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="admin-filters">
        <input
          className="admin-input admin-input--search"
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Tìm theo người gửi, người nhận, nội dung…"
          aria-label="Tìm lời chúc"
        />
        <select className="admin-select" value={studentId} onChange={(event) => applyFilter(status, event.target.value)} aria-label="Người nhận">
          <option value="">Mọi người nhận</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>{student.full_name}</option>
          ))}
        </select>
        {data.items.length > 0 && (
          <label className="admin-check-label">
            <input type="checkbox" className="admin-check" checked={allVisibleSelected} onChange={toggleAllVisible} />
            Chọn tất cả
          </label>
        )}
        <span className="admin-header-note">{data.pagination.total} kết quả</span>
        <button type="button" className="admin-btn admin-btn--ink push-end" onClick={() => setComposeOpen((open) => !open)}>
          {composeOpen ? 'Đóng khung soạn' : '✍ Soạn lời chúc'}
        </button>
      </div>

      {/* Form soạn mặc định đóng: việc hằng ngày là DUYỆT, danh sách phải ở màn hình đầu */}
      {composeOpen && (
        <form className="admin-form letter-paper letter-paper--form" onSubmit={submitCompose}>
          <h3>Gửi lời chúc từ admin</h3>
          <label className="admin-field admin-field--full">
            Người nhận (giữ Ctrl/⌘ để chọn nhiều)
            <select
              multiple
              className="admin-select admin-multi"
              value={composeForm.studentIds.map(String)}
              onChange={(event) => setComposeForm({ ...composeForm, studentIds: selectedOptions(event) })}
            >
              {activeStudents.map((student) => (
                <option key={student.id} value={student.id}>{student.full_name}</option>
              ))}
            </select>
          </label>
          <div className="admin-inline admin-field--full">
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setComposeForm({ ...composeForm, studentIds: activeStudents.map((student) => student.id) })}>
              Chọn tất cả người đang hoạt động
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setComposeForm({ ...composeForm, studentIds: [] })}>Bỏ chọn</button>
            <span>{composeForm.studentIds.length} người nhận</span>
          </div>
          <div className="admin-radio-row admin-field--full" role="radiogroup" aria-label="Người gửi">
            <label><input type="radio" name="compose-sender" checked={!composeForm.isAnonymous} onChange={() => setComposeForm({ ...composeForm, isAnonymous: false })} /> Hiện tên</label>
            <label><input type="radio" name="compose-sender" checked={composeForm.isAnonymous} onChange={() => setComposeForm({ ...composeForm, isAnonymous: true, senderName: '' })} /> Ẩn danh</label>
          </div>
          {!composeForm.isAnonymous && (
            <label className="admin-field">Tên người gửi<input className="input-hand" maxLength={100} value={composeForm.senderName} onChange={(event) => setComposeForm({ ...composeForm, senderName: event.target.value })} /></label>
          )}
          <label className="admin-field">Trạng thái
            <select className="input-hand" value={composeForm.status} onChange={(event) => setComposeForm({ ...composeForm, status: event.target.value })}>
              {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="admin-field">Hiện lúc (tùy chọn)
            <input className="input-hand" type="datetime-local" value={composeForm.revealAt} min={revealLimits.min} max={revealLimits.max} onChange={(event) => setComposeForm({ ...composeForm, revealAt: event.target.value })} />
          </label>
          <label className="admin-field">Tiêu đề<input className="input-hand" maxLength={200} value={composeForm.title} onChange={(event) => setComposeForm({ ...composeForm, title: event.target.value })} /></label>
          <label className="admin-field admin-field--full">Nội dung<textarea className="input-hand" required maxLength={5000} rows={3} value={composeForm.content} onChange={(event) => setComposeForm({ ...composeForm, content: event.target.value })} /></label>
          <div className="admin-form__actions">
            <button type="button" className="admin-btn" onClick={() => setComposeOpen(false)}>Hủy</button>
            <button className="admin-btn admin-btn--primary" disabled={saving}>{saving ? 'Đang gửi…' : 'Dán tem & gửi ✉'}</button>
          </div>
        </form>
      )}

      {selectedIds.length > 0 && (
        <div className="admin-bulk-bar">
          <b>{selectedIds.length} đã chọn</b>
          <button type="button" className="admin-btn admin-btn--sm admin-btn--moss" onClick={() => bulkChangeStatus('approved')}>✓ Duyệt</button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => bulkChangeStatus('rejected')}>Từ chối</button>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setSelectedIds([])}>Bỏ chọn</button>
          <button type="button" className="admin-btn admin-btn--sm admin-btn--danger push-end" onClick={bulkRemove}>Xóa</button>
        </div>
      )}

      {message && <p key={message} className="admin-alert success" role="status">{message}</p>}
      {error && <p key={error} className="admin-alert error" role="alert">{error}</p>}

      {loading && !data.items.length ? <p className="admin-loading">Đang tải…</p> : data.items.length ? (
        // Giữ nguyên danh sách khi refetch sau duyệt/từ chối — không mất vị trí cuộn
        <div className={`admin-letter-list${loading ? ' refreshing' : ''}`}>
          {data.items.map((letter) => {
            const anonymous = letter.is_anonymous || !letter.sender_name
            const tone = letter.status === 'approved' ? ' letter-row--approved' : letter.status === 'rejected' ? ' letter-row--rejected' : ''
            return (
              <article key={letter.id} className={`letter-row${tone}`}>
                <input
                  type="checkbox"
                  className="admin-check"
                  checked={selectedIds.includes(letter.id)}
                  onChange={() => toggleSelected(letter.id)}
                  aria-label={`Chọn lời chúc gửi ${letter.student_name}`}
                />
                <div className="letter-row__main">
                  <div className="letter-row__meta">
                    <b className={`letter-row__sender${anonymous ? ' letter-row__sender--anon' : ''}`}>
                      {anonymous ? 'Ẩn danh' : letter.sender_name}
                    </b>
                    <span className="letter-row__to">→ <b>{letter.student_name}</b></span>
                    {letter.reveal_at && <span className="chip chip--peach">⏰ hiện {formatReveal(letter.reveal_at)}</span>}
                    {letter.image_url && <span className="chip chip--beige">📷 1 ảnh</span>}
                    {letter.member_type === 'friend' && <span className="chip chip--moss">bạn ngoài lớp</span>}
                    <span className={`admin-badge ${letter.status}`}>
                      {STATUSES.find((item) => item.value === letter.status)?.label || letter.status}
                    </span>
                  </div>
                  {letter.title && <p className="letter-row__title">{letter.title}</p>}
                  <p className="letter-row__content">{letter.content}</p>
                  <div className="letter-row__foot">
                    {letter.image_url && (
                      <Polaroid src={letter.image_url} alt="Ảnh kèm lời chúc" small rotate={-2} tape="none" lazy className="letter-row__photo" />
                    )}
                    <time className="letter-row__time" dateTime={letter.created_at}>Gửi {formatStamp(letter.created_at)}</time>
                    <ReactionSummary reactions={letter.reactions} />
                  </div>
                </div>
                {/* Hành động chính (Duyệt) đứng đầu và nổi bật; Xóa tách xuống cuối */}
                <div className="letter-row__side">
                  {letter.status !== 'approved' && (
                    <button type="button" className="admin-btn admin-btn--moss" onClick={() => changeStatus(letter.id, 'approved')}>✓ Duyệt</button>
                  )}
                  <div className="letter-row__pair">
                    {letter.status !== 'rejected' && <button type="button" className="admin-btn" onClick={() => changeStatus(letter.id, 'rejected')}>Từ chối</button>}
                    <button type="button" className="admin-btn" onClick={() => setSelectedLetter(letter)}>Xem đủ</button>
                  </div>
                  <div className="letter-row__pair">
                    <button type="button" className="admin-btn" onClick={() => startEdit(letter)}>Sửa</button>
                    <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setSelectedLetter({ ...letter, confirmDelete: true })}>Xóa vĩnh viễn</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="admin-empty">Không có lời chúc phù hợp.</div>
      )}

      {data.pagination.totalPages > 1 && (
        <div className="admin-pagination">
          <button type="button" className="admin-btn admin-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button>
          <span>Trang {page} / {data.pagination.totalPages}</span>
          <button type="button" className="admin-btn admin-btn--sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Sau →</button>
        </div>
      )}

      {editingLetter && editForm && (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeEdit}>
          <section ref={editDialogRef} className="admin-modal large" role="dialog" aria-modal="true" aria-labelledby="letter-edit-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="letter-edit-title">Sửa lời chúc</h3>
            <form className="admin-form" onSubmit={submitEdit}>
              <label className="admin-field admin-field--full">Người nhận
                <select className="input-hand" value={editForm.studentId} onChange={(event) => setEditForm({ ...editForm, studentId: event.target.value })}>
                  {activeStudents.map((student) => (
                    <option key={student.id} value={student.id}>{student.full_name}</option>
                  ))}
                </select>
              </label>
              <div className="admin-radio-row admin-field--full" role="radiogroup" aria-label="Người gửi">
                <label><input type="radio" name="edit-sender" checked={!editForm.isAnonymous} onChange={() => setEditForm({ ...editForm, isAnonymous: false })} /> Hiện tên</label>
                <label><input type="radio" name="edit-sender" checked={editForm.isAnonymous} onChange={() => setEditForm({ ...editForm, isAnonymous: true, senderName: '' })} /> Ẩn danh</label>
              </div>
              {!editForm.isAnonymous && <label className="admin-field">Tên người gửi<input className="input-hand" maxLength={100} value={editForm.senderName} onChange={(event) => setEditForm({ ...editForm, senderName: event.target.value })} /></label>}
              <label className="admin-field">Trạng thái
                <select className="input-hand" value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="admin-field">Hiện lúc
                <input className="input-hand" type="datetime-local" value={editForm.revealAt} onChange={(event) => setEditForm({ ...editForm, revealAt: event.target.value })} />
              </label>
              <label className="admin-field">Tiêu đề<input className="input-hand" maxLength={200} value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></label>
              <label className="admin-field admin-field--full">Nội dung<textarea className="input-hand" required maxLength={5000} rows={4} value={editForm.content} onChange={(event) => setEditForm({ ...editForm, content: event.target.value })} /></label>
              <div className="admin-form__actions">
                <button type="button" className="admin-btn" onClick={closeEdit}>Hủy</button>
                <button className="admin-btn admin-btn--primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu chỉnh sửa'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedLetter && (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeDetail}>
          <section ref={detailDialogRef} className="admin-modal large" role="dialog" aria-modal="true" aria-labelledby="letter-modal-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="letter-modal-title">
              {selectedLetter.confirmDelete ? 'Xóa lời chúc' : (selectedLetter.title || 'Nội dung lời chúc')}
            </h3>
            <p className="admin-letter-full">{selectedLetter.content}</p>
            {selectedLetter.image_url && (
              <Polaroid src={selectedLetter.image_url} alt="Ảnh kèm lời chúc" rotate={-1} tape="none" style={{ width: 'min(320px, 100%)', margin: '10px 0' }} />
            )}
            <p>
              Người nhận: <b>{selectedLetter.student_name}</b> · Người gửi: {selectedLetter.is_anonymous || !selectedLetter.sender_name ? 'Ẩn danh' : selectedLetter.sender_name}
              {' · '}Gửi {formatStamp(selectedLetter.created_at)}
            </p>
            {!selectedLetter.confirmDelete && (
              <div>
                <span className="admin-hint" style={{ display: 'block', marginBottom: 6 }}>Cảm xúc nhận được</span>
                {Object.values(selectedLetter.reactions || {}).some(Boolean)
                  ? <ReactionSummary reactions={selectedLetter.reactions} />
                  : <span className="admin-hint">Chưa có cảm xúc nào</span>}
              </div>
            )}
            <div className="admin-form-actions">
              {selectedLetter.confirmDelete ? (
                <button type="button" className="admin-btn admin-btn--primary" onClick={() => remove(selectedLetter.id)}>Xóa vĩnh viễn</button>
              ) : (
                <>
                  <button type="button" className="admin-btn" onClick={() => { startEdit(selectedLetter); setSelectedLetter(null) }}>Sửa</button>
                  {selectedLetter.status !== 'approved' && <button type="button" className="admin-btn admin-btn--moss" onClick={() => changeStatus(selectedLetter.id, 'approved')}>✓ Duyệt</button>}
                  {selectedLetter.status !== 'rejected' && <button type="button" className="admin-btn" onClick={() => changeStatus(selectedLetter.id, 'rejected')}>Từ chối</button>}
                </>
              )}
              <button type="button" className="admin-btn" onClick={() => setSelectedLetter(null)}>Đóng</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default LetterManager
