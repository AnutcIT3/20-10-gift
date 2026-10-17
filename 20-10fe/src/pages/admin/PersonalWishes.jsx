import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../api/adminApi'
import Polaroid from '../../components/paper/Polaroid'
import { AUDIENCE_LABELS, greetingRequest } from '../../lib/greeting'

// Cùng giới hạn với mọi ảnh kèm lời chúc (backend chặn 5 MB)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function imageProblem(file) {
  if (!IMAGE_TYPES.includes(file.type)) return 'Ảnh phải là JPG, PNG, GIF hoặc WebP.'
  if (file.size > MAX_IMAGE_BYTES) return 'Ảnh tối đa 5 MB.'
  return ''
}

// Một loại lời chúc của một bạn: chữ (sửa được, trừ lời chúc tự động) và ảnh kèm
function WishBlock({ student, kind, title, hint, field, onSaved, children }) {
  const fileRef = useRef(null)
  const imageUrl = student[`${kind}_image_url`]
  const saved = field ? (student[field] || '') : ''
  const [text, setText] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  // Chữ đã lưu đổi từ nơi khác (trang Học sinh, máy khác) thì ô theo kịp
  useEffect(() => {
    const sync = setTimeout(() => setText(saved), 0)
    return () => clearTimeout(sync)
  }, [saved])

  const run = async (action, done) => {
    setBusy(true); setError(''); setNote('')
    try {
      onSaved(await action())
      setNote(done)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const saveText = () => run(() => adminApi.updateStudent(student.id, { [field]: text.trim() || null }), 'Đã lưu chữ.')

  const chooseImage = (file) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const problem = imageProblem(file)
    if (problem) { setError(problem); setNote(''); return }
    run(() => adminApi.setWishImage(student.id, kind, file), imageUrl ? 'Đã đổi ảnh.' : 'Đã thêm ảnh.')
  }

  const removeImage = () => run(() => adminApi.clearWishImage(student.id, kind), 'Đã bỏ ảnh.')

  return (
    <section className="wish-block" aria-label={`${title} — ${student.full_name}`}>
      <h4 className="wish-block__title">{title} <small>{hint}</small></h4>
      {field && (
        <>
          <textarea
            className="input-hand wish-block__text"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label={`${title} của ${student.full_name}`}
            placeholder="Để trống thì không hiện gì"
          />
          <button type="button" className="admin-btn admin-btn--sm" onClick={saveText} disabled={busy || text === saved}>
            Lưu chữ
          </button>
        </>
      )}
      {children}
      <div className="wish-block__image">
        {imageUrl && <Polaroid src={imageUrl} alt={`Ảnh kèm ${title.toLowerCase()}`} small rotate={-2} tape="none" />}
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          📷 {imageUrl ? 'Đổi ảnh' : 'Kèm ảnh (≤ 5 MB)'}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={IMAGE_TYPES.join(',')}
          aria-label={`Ảnh kèm ${title.toLowerCase()} của ${student.full_name}`}
          onChange={(event) => chooseImage(event.target.files?.[0] || null)}
        />
        {imageUrl && (
          <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" onClick={removeImage} disabled={busy}>Bỏ ảnh</button>
        )}
      </div>
      {busy && <p className="admin-hint">Đang lưu…</p>}
      {note && <p className="admin-hint is-moss" role="status">{note}</p>}
      {error && <p className="admin-alert error" role="alert">{error}</p>}
    </section>
  )
}

// ✨ Máy viết lời này mỗi lần mở trang (có Gemini thì mỗi lần một khác) — chỉ xem
// thử được, không sửa; ảnh kèm thì do admin chọn
function GreetingPreview({ student }) {
  const { name, audience } = greetingRequest({ ...student, closeFriend: Number(student.face_profile_count) > 0 })
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const result = await adminApi.previewGreeting(name, audience)
      setPreview(result?.greeting || '')
    } catch (err) {
      setError(err.status === 423 ? 'Trang quà đang khoá chờ 20/10 nên chưa xem thử được.' : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wish-block__auto">
      <p className="admin-hint">Kiểu: <b>{AUDIENCE_LABELS[audience]}</b> · máy viết khi trang quà mở, gọi là “{name}”.</p>
      {preview && <blockquote className="wish-block__preview">{preview}</blockquote>}
      <button type="button" className="admin-btn admin-btn--sm" onClick={load} disabled={loading}>
        {loading ? 'Đang viết thử…' : preview ? 'Viết thử lại' : 'Xem thử'}
      </button>
      {error && <p className="admin-alert error" role="alert">{error}</p>}
    </div>
  )
}

/**
 * Tab "Riêng từng bạn" của trang Lời chúc: ba lời chúc riêng của mỗi bạn quản
 * lý ở một chỗ — lời chúc riêng (dưới tên), 💌 lời chúc từ admin, ✨ lời chúc tự
 * động — mỗi loại kèm được một ảnh. Trên trang quà chúng vẫn nằm đúng chỗ cũ.
 */
function PersonalWishes({ students, studentId = '', onStudentSaved }) {
  const [query, setQuery] = useState('')
  const keyword = query.trim().toLowerCase()
  const visible = students
    .filter((student) => student.is_active !== false)
    .filter((student) => !studentId || String(student.id) === String(studentId))
    .filter((student) => !keyword || `${student.full_name} ${student.nickname || ''}`.toLowerCase().includes(keyword))
  // Thành viên lớp trước, khách ngoài lớp sau — như trang Học sinh
  const ordered = [
    ...visible.filter((student) => student.member_type !== 'friend'),
    ...visible.filter((student) => student.member_type === 'friend'),
  ]

  return (
    <div className="personal-wishes">
      <div className="admin-filters">
        <input
          className="admin-input admin-input--search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm bạn…"
          aria-label="Tìm bạn"
        />
        <span className="admin-header-note">{ordered.length} bạn</span>
      </div>
      {ordered.length === 0 && <p className="admin-loading">Không có bạn nào phù hợp.</p>}
      {ordered.map((student) => (
        <article key={student.id} className="admin-card wish-card" aria-label={`Lời chúc riêng của ${student.full_name}`}>
          <h3 className="wish-card__name">
            {student.full_name}
            {student.nickname && student.nickname !== student.full_name && <small> “{student.nickname}”</small>}
            {student.member_type === 'friend' && <span className="chip chip--moss">khách ngoài lớp</span>}
            {student.member_type === 'test' && <span className="chip chip--beige">tài khoản thử</span>}
          </h3>
          <div className="wish-card__blocks">
            <WishBlock student={student} kind="intro" field="intro_message" title="Lời chúc riêng" hint="hiện ngay dưới tên" onSaved={onStudentSaved} />
            <WishBlock student={student} kind="admin_wish" field="admin_wish" title="💌 Lời chúc từ admin" hint="ô riêng trên trang quà" onSaved={onStudentSaved} />
            <WishBlock student={student} kind="greeting" title="✨ Lời chúc tự động" hint="máy viết, kèm ảnh admin chọn" onSaved={onStudentSaved}>
              <GreetingPreview student={student} />
            </WishBlock>
          </div>
        </article>
      ))}
    </div>
  )
}

export default PersonalWishes
