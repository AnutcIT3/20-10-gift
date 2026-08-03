import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'

const EMPTY_FORM = { full_name: '', nickname: '', avatar_url: '', intro_message: '', class_name: 'A1' }

function ConfirmModal({ title, message, confirmLabel = 'Xác nhận', danger = false, onConfirm, onCancel }) {
  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="admin-form-actions">
          <button type="button" className={danger ? 'admin-danger-primary' : 'admin-primary'} onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" onClick={onCancel}>Hủy</button>
        </div>
      </section>
    </div>
  )
}

function LinkEditorModal({ student, saving, onSave, onCancel }) {
  const currentCode = student.giftPath.split('/').filter(Boolean).pop() || ''
  const [accessCode, setAccessCode] = useState(currentCode)
  const previewCode = accessCode.trim().toLowerCase()

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="link-editor-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="link-editor-title">Sửa link của {student.full_name}</h3>
        <form className="admin-link-form" onSubmit={(event) => { event.preventDefault(); onSave(previewCode) }}>
          <label>
            Mã link
            <input
              autoFocus
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_-]+"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value.toLowerCase())}
              placeholder="mai-anh"
            />
          </label>
          <p className="admin-link-preview">{window.location.origin}/gift/{previewCode}</p>
          <div className="admin-form-actions">
            <button className="admin-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu link'}</button>
            <button type="button" onClick={onCancel}>Hủy</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function StudentManager() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [query, setQuery] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [linkEditor, setLinkEditor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingLink, setSavingLink] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setStudents(await adminApi.listStudents()); setError('') }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let cancelled = false
    adminApi.listStudents()
      .then((data) => { if (!cancelled) { setStudents(data); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filteredStudents = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return students
    return students.filter((student) => `${student.full_name || ''} ${student.nickname || ''} ${student.class_name || ''}`.toLowerCase().includes(keyword))
  }, [students, query])

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const data = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null]))
      if (editingId) await adminApi.updateStudent(editingId, data)
      else await adminApi.createStudent(data)
      setForm(EMPTY_FORM); setEditingId(null); setMessage(editingId ? 'Đã cập nhật học sinh.' : 'Đã thêm học sinh.')
      await load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const edit = (student) => {
    setEditingId(student.id)
    setForm({
      full_name: student.full_name || '',
      nickname: student.nickname || '',
      avatar_url: student.avatar_url || '',
      intro_message: student.intro_message || '',
      class_name: student.class_name || 'A1',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const copyLink = async (student) => {
    const url = `${window.location.origin}${student.giftPath}`
    try {
      await navigator.clipboard.writeText(url)
      setMessage(`Đã sao chép link của ${student.full_name}.`)
    } catch {
      setError('Không thể sao chép tự động. Hãy copy link thủ công.')
    }
  }

  const viewLetters = (student) => {
    navigate(`/admin/letters?studentId=${student.id}&status=approved`)
  }

  const deactivate = (student) => {
    setConfirmAction({
      title: 'Ngừng hoạt động trang quà',
      message: `Trang của ${student.full_name} sẽ không còn truy cập được qua link hiện tại.`,
      confirmLabel: 'Ngừng hoạt động',
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
      danger: true,
      run: async () => {
        await adminApi.deleteStudent(student.id)
        if (editingId === student.id) {
          setEditingId(null)
          setForm(EMPTY_FORM)
        }
        await load()
        setMessage(`Đã xóa ${student.full_name}.`)
      },
    })
  }

  const editLink = (student) => {
    setError('')
    setMessage('')
    setLinkEditor(student)
  }

  const saveLink = async (accessCode) => {
    if (!linkEditor) return
    setSavingLink(true)
    setError('')
    try {
      const result = await adminApi.updateGiftLink(linkEditor.id, accessCode)
      setLinkEditor(null)
      await load()
      setMessage(`Đã đổi link thành ${result.giftPath}. Link cũ không còn hiệu lực.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingLink(false)
    }
  }

  const confirm = async () => {
    const action = confirmAction
    setConfirmAction(null)
    if (!action) return
    try { await action.run(); setError('') }
    catch (err) { setError(err.message) }
  }

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Học sinh</p>
          <h2>Quản lý học sinh</h2>
        </div>
        <button
          type="button"
          className="dash-export-btn"
          disabled={exporting}
          onClick={async () => {
            setExporting(true)
            try { await adminApi.exportStudents(); setMessage('Xuất CSV thành công!') }
            catch (err) { setError(err.message) }
            finally { setExporting(false) }
          }}
        >
          {exporting ? 'Đang xuất...' : '⬇️ Xuất CSV'}
        </button>
      </header>
      <form className="admin-panel admin-form-grid" onSubmit={submit}>
        <h3>{editingId ? 'Chỉnh sửa học sinh' : 'Thêm học sinh'}</h3>
        <label>Họ và tên<input required maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
        <label>Biệt danh<input maxLength={50} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></label>
        <label>Lớp<input maxLength={20} value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} /></label>
        <label className="admin-span-2">URL avatar<input maxLength={500} value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} /></label>
        {form.avatar_url && <div className="admin-avatar-preview admin-span-2"><img src={form.avatar_url} alt="Preview avatar" onError={(event) => { event.currentTarget.style.display = 'none' }} /></div>}
        <label className="admin-span-2">Lời giới thiệu<textarea value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} /></label>
        <div className="admin-form-actions admin-span-2">
          <button className="admin-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }}>Hủy</button>}
        </div>
      </form>
      {message && <p className="admin-alert success" role="status">{message}</p>}{error && <p className="admin-alert error" role="alert">{error}</p>}
      <div className="admin-panel">
        <label>Tìm kiếm học sinh<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nhập tên, biệt danh hoặc lớp" /></label>
      </div>
      <div className="admin-panel admin-table-wrap">
        {loading ? <p>Đang tải...</p> : <table><thead><tr><th>Học sinh</th><th>Lớp</th><th>Trạng thái</th><th>Gift link</th><th>Thao tác</th></tr></thead>
          <tbody>{filteredStudents.map((student) => <tr key={student.id}>
            <td><div className="admin-student-cell">{student.avatar_url ? <img src={student.avatar_url} alt="" /> : <span>{student.full_name?.charAt(0)}</span>}<div><strong>{student.full_name}</strong><small>{student.nickname}</small></div></div></td><td>{student.class_name}</td>
            <td><span className={`admin-badge ${student.is_active ? 'active' : 'inactive'}`}>{student.is_active ? 'Hoạt động' : 'Đã tắt'}</span></td>
            <td><a href={student.giftPath} target="_blank" rel="noreferrer">{student.giftPath}</a></td>
            <td className="admin-row-actions"><button onClick={() => copyLink(student)}>Copy link</button><button onClick={() => viewLetters(student)}>Xem lời chúc</button><button onClick={() => edit(student)}>Sửa</button><button onClick={() => editLink(student)}>Sửa link</button>{student.is_active ? <button className="danger" onClick={() => deactivate(student)}>Tắt</button> : <button className="approve" onClick={() => activate(student)}>Bật</button>}<button className="danger" onClick={() => removeStudent(student)}>Xóa</button></td>
          </tr>)}</tbody></table>}
      </div>
      {linkEditor && <LinkEditorModal key={linkEditor.id} student={linkEditor} saving={savingLink} onSave={saveLink} onCancel={() => setLinkEditor(null)} />}
      {confirmAction && <ConfirmModal {...confirmAction} onConfirm={confirm} onCancel={() => setConfirmAction(null)} />}
    </section>
  )
}

export default StudentManager
