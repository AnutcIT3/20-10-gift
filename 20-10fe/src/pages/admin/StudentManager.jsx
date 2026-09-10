import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'
import useDialogA11y from '../../hooks/useDialogA11y'
import { seatLabel } from '../../lib/seat'
import { cld, CLD_TINY } from '../../lib/cloudinary'

const EMPTY_FORM = {
  full_name: '', nickname: '', avatar_url: '', intro_message: '', class_name: 'A1', access_code: '', is_active: true,
}
const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'friend', label: 'Bạn ngoài lớp' },
  { value: 'noimg', label: 'Chưa có ảnh' },
  { value: 'noavatar', label: 'Chưa có ảnh đại diện' },
]
const FILTER_VALUES = FILTERS.map((item) => item.value)

function accessCodeOf(student) {
  return (student.giftPath || '').split('/').filter(Boolean).pop() || ''
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

// Menu ⋮ gom các thao tác phụ/nguy hiểm, bảng chỉ còn các nút dùng hằng ngày.
// Menu render position:fixed để không bị cắt bởi overflow của khung bảng.
function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, up: false })
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const toggle = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const up = rect.bottom + 240 > window.innerHeight
    setPos({ top: up ? rect.top - 4 : rect.bottom + 4, left: Math.max(8, rect.right - 170), up })
    setOpen((current) => !current)
  }

  return (
    <span ref={wrapRef}>
      <button type="button" className="stu-menu-btn" aria-label="Thao tác khác" aria-expanded={open} onClick={toggle}>⋮</button>
      {open && (
        <div
          className="admin-menu"
          role="menu"
          style={{ top: pos.top, left: pos.left, transform: pos.up ? 'translateY(-100%)' : undefined }}
        >
          {items.map(({ label, danger, onClick }) => (
            <button
              type="button"
              role="menuitem"
              key={label}
              className={danger ? 'danger' : ''}
              onClick={() => { setOpen(false); onClick() }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

function ConfirmModal({ title, message, confirmLabel = 'Xác nhận', onConfirm, onCancel }) {
  const dialogRef = useDialogA11y(true, onCancel)
  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onCancel}>
      <section ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="admin-form-actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="admin-btn" onClick={onCancel}>Hủy</button>
        </div>
      </section>
    </div>
  )
}

function StudentManager() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [query, setQuery] = useState('')
  // Thẻ "chưa có ảnh đại diện" ở Tổng quan dẫn thẳng tới bộ lọc tương ứng
  const [filter, setFilter] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('filter')
    return FILTER_VALUES.includes(fromUrl) ? fromUrl : 'all'
  })
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const formRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setStudents(await adminApi.listStudents()); setError('') }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  // setTimeout 0 để setState không chạy đồng bộ trong effect (react-hooks v7)
  useEffect(() => {
    const initial = setTimeout(load, 0)
    return () => clearTimeout(initial)
  }, [load])

  const filteredStudents = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return students.filter((student) => {
      if (filter === 'active' && !student.is_active) return false
      if (filter === 'friend' && student.member_type !== 'friend') return false
      if (filter === 'noimg' && (student.member_type === 'friend' || Number(student.gallery_count) > 0)) return false
      if (filter === 'noavatar' && (student.member_type === 'friend' || student.avatar_url)) return false
      if (!keyword) return true
      return `${student.full_name || ''} ${student.nickname || ''} ${student.class_name || ''} ${accessCodeOf(student)}`
        .toLowerCase().includes(keyword)
    })
  }, [students, query, filter])

  const closeForm = () => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(false) }

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const data = {
        full_name: form.full_name.trim() || null,
        nickname: form.nickname.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        intro_message: form.intro_message.trim() || null,
        class_name: form.class_name.trim() || null,
      }
      if (editingId) {
        const current = students.find((student) => student.id === editingId)
        await adminApi.updateStudent(editingId, data)
        // Mã truy cập và trạng thái có API riêng — chỉ gọi khi thật sự đổi
        const nextCode = form.access_code.trim().toLowerCase()
        if (current && nextCode && nextCode !== accessCodeOf(current)) {
          await adminApi.updateGiftLink(editingId, nextCode)
        }
        if (current && Boolean(current.is_active) !== form.is_active) {
          if (form.is_active) await adminApi.activateStudent(editingId)
          else await adminApi.deactivateStudent(editingId)
        }
      } else {
        await adminApi.createStudent(data)
      }
      const wasEditing = Boolean(editingId)
      closeForm()
      setMessage(wasEditing ? 'Đã cập nhật học sinh.' : 'Đã thêm học sinh.')
      await load()
    } catch (err) { setError(err.message); await load() }
    finally { setSaving(false) }
  }

  const edit = (student) => {
    setFormOpen(true)
    setEditingId(student.id)
    setForm({
      full_name: student.full_name || '',
      nickname: student.nickname || '',
      avatar_url: student.avatar_url || '',
      intro_message: student.intro_message || '',
      class_name: student.class_name || 'A1',
      access_code: accessCodeOf(student),
      is_active: Boolean(student.is_active),
    })
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const copyLink = async (student) => {
    const url = `${window.location.origin}${student.giftPath}`
    setError('')
    try {
      await navigator.clipboard.writeText(url)
      // Xác nhận ngay trên nút vừa bấm — không bắt mắt phải tìm alert nơi khác
      setCopiedId(student.id)
      setTimeout(() => setCopiedId((current) => (current === student.id ? null : current)), 2000)
    } catch {
      setError('Không thể sao chép tự động. Hãy copy link thủ công.')
    }
  }

  const deactivate = (student) => {
    setConfirmAction({
      title: 'Tắt trang quà',
      message: `Trang của ${student.full_name} sẽ không còn truy cập được qua link hiện tại. Có thể Bật lại bất cứ lúc nào.`,
      confirmLabel: 'Tắt trang',
      run: async () => {
        await adminApi.deactivateStudent(student.id)
        await load()
      },
    })
  }

  const activate = async (student) => {
    setError('')
    setMessage('')
    try {
      await adminApi.activateStudent(student.id)
      await load()
      setMessage(`Đã bật lại trang của ${student.full_name}.`)
    } catch (err) {
      setError(err.message)
    }
  }

  const removeStudent = (student) => {
    setConfirmAction({
      title: 'Xóa học sinh',
      message: `Xóa vĩnh viễn ${student.full_name} cùng toàn bộ ảnh, lời chúc, reaction và lượt xem? Thao tác này không thể hoàn tác.`,
      confirmLabel: 'Xóa vĩnh viễn',
      run: async () => {
        await adminApi.deleteStudent(student.id)
        if (editingId === student.id) closeForm()
        await load()
        setMessage(`Đã xóa ${student.full_name}.`)
      },
    })
  }

  const confirm = async () => {
    const action = confirmAction
    setConfirmAction(null)
    if (!action) return
    // Clear trước để toast của thông báo kế tiếp được remount và chạy lại animation
    setMessage('')
    setError('')
    try { await action.run() }
    catch (err) { setError(err.message) }
  }

  const exportStudents = async () => {
    setExporting(true)
    setMessage('')
    setError('')
    try { await adminApi.exportStudents(); setMessage('Xuất CSV thành công!') }
    catch (err) { setError(err.message) }
    finally { setExporting(false) }
  }

  const classMembers = students.filter((student) => student.member_type !== 'friend').length
  const withoutAvatar = students.filter((student) => student.member_type !== 'friend' && !student.avatar_url).length

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Học sinh</p>
          <h2>
            Danh sách lớp · {classMembers} bạn
            {withoutAvatar > 0 && <small className="is-clay"> · {withoutAvatar} chưa có ảnh đại diện</small>}
          </h2>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn" disabled={exporting} onClick={exportStudents}>
            {exporting ? 'Đang xuất…' : '⤓ Xuất CSV'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={() => {
              if (editingId) {
                // Đang sửa → chuyển sang chế độ thêm mới
                setEditingId(null)
                setForm(EMPTY_FORM)
                setFormOpen(true)
              } else {
                setFormOpen((open) => !open)
              }
            }}
          >
            {formOpen && !editingId ? 'Đóng khung thêm' : '+ Thêm học sinh'}
          </button>
        </div>
      </header>

      {message && <p key={message} className="admin-alert success" role="status">{message}</p>}
      {error && <p key={error} className="admin-alert error" role="alert">{error}</p>}

      {/* Form thêm/sửa mặc định đóng — thêm học sinh là việc chỉ làm lúc setup */}
      {(formOpen || editingId) && (
        <form ref={formRef} className="admin-form letter-paper letter-paper--form" onSubmit={submit}>
          <h3>{editingId ? 'Sửa học sinh' : 'Thêm học sinh'}</h3>
          <label className="admin-field">Họ và tên<input className="input-hand" required maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
          <label className="admin-field">Tên gọi<input className="input-hand" maxLength={50} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></label>
          <label className="admin-field">Mã truy cập
            <input
              className="input-hand input-hand--mono"
              value={form.access_code}
              disabled={!editingId}
              placeholder={editingId ? 'mai-anh' : 'tự tạo khi lưu'}
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_-]+"
              onChange={(e) => setForm({ ...form, access_code: e.target.value.toLowerCase() })}
            />
          </label>
          <label className="admin-field">Trạng thái
            <select className="input-hand" value={form.is_active ? 'active' : 'inactive'} disabled={!editingId} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Đã tắt</option>
            </select>
          </label>
          <label className="admin-field">Lớp<input className="input-hand" maxLength={20} value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} /></label>
          <label className="admin-field">
            Ảnh đại diện (link ảnh trong thư viện)
            <input className="input-hand input-hand--mono" maxLength={500} value={form.avatar_url} onChange={(e) => { setAvatarBroken(false); setForm({ ...form, avatar_url: e.target.value }) }} placeholder="https://res.cloudinary.com/…" />
          </label>
          {form.avatar_url && (
            <div className="admin-avatar-preview">
              {avatarBroken
                ? <p className="admin-hint is-clay">Không tải được ảnh từ link này. Cách dễ nhất: vào Thư viện ảnh của bạn ấy và bấm "Đặt làm ảnh đại diện".</p>
                : <img src={cld(form.avatar_url, CLD_TINY)} alt="Preview avatar" onError={() => setAvatarBroken(true)} />}
            </div>
          )}
          <label className="admin-field admin-field--full">Lời dẫn trên trang quà<textarea className="input-hand" rows={2} value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} /></label>
          {editingId && form.access_code && (
            <p className="admin-form__note">Link quà: {window.location.origin}/gift/{form.access_code.trim().toLowerCase()} — đổi mã thì link cũ hết hiệu lực.</p>
          )}
          <div className="admin-form__actions">
            <button type="button" className="admin-btn" onClick={closeForm}>Hủy</button>
            <button className="admin-btn admin-btn--primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
          </div>
        </form>
      )}

      <div className="admin-filters">
        <input
          className="admin-input admin-input--search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tên, tên gọi, mã truy cập…"
          aria-label="Tìm kiếm học sinh"
        />
        <div className="admin-tabs admin-tabs--sm" role="group" aria-label="Lọc học sinh">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" className={filter === item.value ? 'active' : ''} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-card stu-table" role="table" aria-label="Danh sách học sinh">
        <div className="stu-row stu-row--head" role="row">
          <span role="columnheader">HỌ TÊN</span>
          <span role="columnheader">CHỖ NGỒI</span>
          <span role="columnheader">ẢNH</span>
          <span role="columnheader">LỜI CHÚC</span>
          <span role="columnheader">LƯỢT XEM</span>
          <span role="columnheader">LINK QUÀ</span>
          <span role="columnheader" aria-label="Thao tác" />
        </div>
        {loading ? <p className="admin-loading" style={{ padding: '16px 18px' }}>Đang tải…</p>
          : filteredStudents.length === 0 ? <p className="admin-loading" style={{ padding: '16px 18px' }}>Không có học sinh phù hợp.</p>
          : filteredStudents.map((student) => {
            const isFriend = student.member_type === 'friend'
            const photos = Number(student.gallery_count ?? 0)
            const noImage = !isFriend && photos === 0
            const noAvatar = !isFriend && !student.avatar_url
            const seat = seatLabel(student.seat_row, student.seat_col)
            const initial = (student.nickname || student.full_name || '?').trim().charAt(0).toUpperCase()
            const statusLine = [
              student.nickname && student.nickname !== student.full_name ? `"${student.nickname}"` : null,
              isFriend ? 'bạn ngoài lớp · tự tạo khi có lời chúc'
                : !student.is_active ? 'đã tắt'
                  : noImage ? 'chưa có ảnh'
                    : noAvatar ? 'chưa chọn ảnh đại diện' : 'đang hoạt động',
            ].filter(Boolean).join(' · ')
            return (
              <div key={student.id} className={`stu-row${noImage ? ' stu-row--noimg' : ''}`} role="row">
                <div className="stu-name" role="cell">
                  <span className={`stu-avatar${isFriend ? ' stu-avatar--friend' : noImage ? ' stu-avatar--noimg' : ''}`} aria-hidden="true">
                    {student.avatar_url ? <img src={cld(student.avatar_url, CLD_TINY)} alt="" /> : initial}
                  </span>
                  <div>
                    <b>{student.full_name}</b>
                    <small className={isFriend ? 'is-moss' : (noImage || noAvatar) ? 'is-clay' : ''}>{statusLine}</small>
                  </div>
                </div>
                <span className={`stu-cell${seat ? '' : ' stu-cell--muted'}`} role="cell">{seat ? capitalize(seat) : '—'}</span>
                <span className={`stu-cell${isFriend ? ' stu-cell--muted' : noImage ? ' stu-cell--clay' : ''}`} role="cell">{isFriend ? '—' : `${photos} ảnh`}</span>
                <span className="stu-cell" role="cell">
                  <b>{Number(student.letter_count ?? 0)}</b>
                  {Number(student.pending_letter_count) > 0 && ` · ${student.pending_letter_count} chờ`}
                </span>
                <span className="stu-cell" role="cell">{Number(student.view_count ?? 0)}</span>
                <div className="stu-link" role="cell">
                  <code title={student.giftPath}>{student.giftPath}</code>
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => copyLink(student)}>
                    {copiedId === student.id ? 'Đã copy ✓' : 'Copy'}
                  </button>
                </div>
                <div role="cell">
                  <RowMenu items={[
                    { label: 'Sửa thông tin', onClick: () => edit(student) },
                    { label: 'Mở trang quà', onClick: () => window.open(student.giftPath, '_blank', 'noopener') },
                    { label: 'Lời chúc', onClick: () => navigate(`/admin/letters?studentId=${student.id}&status=approved`) },
                    { label: 'Ảnh', onClick: () => navigate(`/admin/gallery?studentId=${student.id}`) },
                    student.is_active
                      ? { label: 'Tắt trang', danger: true, onClick: () => deactivate(student) }
                      : { label: 'Bật trang', onClick: () => activate(student) },
                    { label: 'Xóa vĩnh viễn', danger: true, onClick: () => removeStudent(student) },
                  ]} />
                </div>
              </div>
            )
          })}
      </div>
      {confirmAction && <ConfirmModal {...confirmAction} onConfirm={confirm} onCancel={() => setConfirmAction(null)} />}
    </section>
  )
}

export default StudentManager
