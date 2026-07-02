import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../api/adminApi'

const EMPTY_FORM = { full_name: '', nickname: '', avatar_url: '', intro_message: '', class_name: 'A1' }

function StudentManager() {
  const [students, setStudents] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
      full_name: student.full_name || '', nickname: student.nickname || '', avatar_url: student.avatar_url || '',
      intro_message: student.intro_message || '', class_name: student.class_name || 'A1',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deactivate = async (student) => {
    if (!window.confirm(`Ngừng hoạt động trang của ${student.full_name}?`)) return
    try { await adminApi.deactivateStudent(student.id); await load() } catch (err) { setError(err.message) }
  }

  const rotate = async (student) => {
    if (!window.confirm(`Đổi link quà của ${student.full_name}? Link cũ sẽ hết hiệu lực.`)) return
    try { await adminApi.rotateCode(student.id); await load(); setMessage('Đã tạo link mới.') }
    catch (err) { setError(err.message) }
  }

  return (
    <section>
      <header className="admin-page-header"><div><p className="admin-kicker">Students</p><h2>Quản lý học sinh</h2></div></header>
      <form className="admin-panel admin-form-grid" onSubmit={submit}>
        <h3>{editingId ? 'Chỉnh sửa học sinh' : 'Thêm học sinh'}</h3>
        <label>Họ và tên<input required maxLength={100} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
        <label>Biệt danh<input maxLength={50} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></label>
        <label>Lớp<input maxLength={20} value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} /></label>
        <label className="admin-span-2">URL avatar<input maxLength={500} value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} /></label>
        <label className="admin-span-2">Lời giới thiệu<textarea value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} /></label>
        <div className="admin-form-actions admin-span-2">
          <button className="admin-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM) }}>Hủy</button>}
        </div>
      </form>
      {message && <p className="admin-alert success">{message}</p>}{error && <p className="admin-alert error">{error}</p>}
      <div className="admin-panel admin-table-wrap">
        {loading ? <p>Đang tải...</p> : <table><thead><tr><th>Họ tên</th><th>Lớp</th><th>Trạng thái</th><th>Gift link</th><th>Thao tác</th></tr></thead>
          <tbody>{students.map((student) => <tr key={student.id}>
            <td><strong>{student.full_name}</strong><small>{student.nickname}</small></td><td>{student.class_name}</td>
            <td><span className={`admin-badge ${student.is_active ? 'active' : 'inactive'}`}>{student.is_active ? 'Hoạt động' : 'Đã tắt'}</span></td>
            <td><a href={student.giftPath} target="_blank" rel="noreferrer">{student.giftPath}</a></td>
            <td className="admin-row-actions"><button onClick={() => edit(student)}>Sửa</button><button onClick={() => rotate(student)}>Đổi link</button>{student.is_active && <button className="danger" onClick={() => deactivate(student)}>Tắt</button>}</td>
          </tr>)}</tbody></table>}
      </div>
    </section>
  )
}

export default StudentManager
