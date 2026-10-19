import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../api/adminApi'
import Polaroid from '../../components/paper/Polaroid'
import { MAX_WISH_IMAGES, WISH_IMAGE_ACCEPT, WISH_IMAGE_TYPES } from '../../hooks/useImagePicks'
import { AUDIENCE_LABELS, greetingRequest } from '../../lib/greeting'
import { wishImages } from '../../lib/images'

// Cùng giới hạn với mọi ảnh kèm lời chúc (backend chặn 5 MB, tối đa 4 ảnh)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function imageProblem(files, room) {
  if (files.some((file) => !WISH_IMAGE_TYPES.includes(file.type))) return 'Ảnh phải là JPG, PNG, GIF hoặc WebP.'
  if (files.some((file) => file.size > MAX_IMAGE_BYTES)) return 'Mỗi ảnh tối đa 5 MB.'
  if (files.length > room) {
    return room > 0
      ? `Mỗi lời chúc kèm tối đa ${MAX_WISH_IMAGES} ảnh — chỉ thêm được ${room} ảnh nữa.`
      : `Lời chúc này đã đủ ${MAX_WISH_IMAGES} ảnh.`
  }
  return ''
}

// Một loại lời chúc của một bạn: chữ sửa được và ảnh kèm. children có thể là
// hàm nhận { setText } — phần xem thử lời chúc tự động dùng để chép câu máy viết vào ô
function WishBlock({
  student, kind, title, hint, field, onSaved, children, placeholder = 'Để trống thì không hiện gì',
}) {
  const fileRef = useRef(null)
  const images = wishImages(student, kind)
  const room = MAX_WISH_IMAGES - images.length
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

  // Chọn một lúc nhiều ảnh: thêm vào sau các ảnh đang có, tổng tối đa 4
  const chooseImages = (fileList) => {
    const files = Array.from(fileList || [])
    if (fileRef.current) fileRef.current.value = ''
    if (!files.length) return
    const problem = imageProblem(files, room)
    if (problem) { setError(problem); setNote(''); return }
    run(() => adminApi.addWishImages(student.id, kind, files), `Đã thêm ${files.length} ảnh.`)
  }

  // Ảnh chưa có id là ảnh ở cột cũ (máy chủ chưa cập nhật) — bỏ hết là bỏ nó
  const removeImage = (image) => run(
    () => (image.id ? adminApi.removeWishImage(student.id, kind, image.id) : adminApi.clearWishImages(student.id, kind)),
    'Đã bỏ ảnh.',
  )
  const removeAll = () => run(() => adminApi.clearWishImages(student.id, kind), 'Đã bỏ hết ảnh.')

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
            placeholder={placeholder}
          />
          <button type="button" className="admin-btn admin-btn--sm" onClick={saveText} disabled={busy || text === saved}>
            Lưu chữ
          </button>
        </>
      )}
      {typeof children === 'function' ? children({ setText }) : children}
      {images.length > 0 && (
        <ul className="wish-block__images" aria-label={`Ảnh kèm ${title.toLowerCase()}`}>
          {images.map((image, index) => (
            <li key={image.id ?? image.url}>
              <Polaroid src={image.url} alt={`Ảnh ${index + 1} kèm ${title.toLowerCase()}`} small rotate={index % 2 ? 2 : -2} tape="none" />
              <button
                type="button"
                className="admin-btn admin-btn--sm admin-btn--danger"
                onClick={() => removeImage(image)}
                disabled={busy}
                aria-label={`Bỏ ảnh ${index + 1}`}
              >
                Bỏ
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="wish-block__image">
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => fileRef.current?.click()} disabled={busy || room <= 0}>
          📷 {room <= 0
            ? `Đủ ${MAX_WISH_IMAGES} ảnh`
            : images.length ? `Thêm ảnh (${images.length}/${MAX_WISH_IMAGES})` : `Kèm ảnh (tối đa ${MAX_WISH_IMAGES}, mỗi ảnh ≤ 5 MB)`}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept={WISH_IMAGE_ACCEPT}
          aria-label={`Ảnh kèm ${title.toLowerCase()} của ${student.full_name}`}
          onChange={(event) => chooseImages(event.target.files)}
        />
        {images.length > 1 && (
          <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" onClick={removeAll} disabled={busy}>Bỏ hết ảnh</button>
        )}
      </div>
      {busy && <p className="admin-hint">Đang lưu…</p>}
      {note && <p className="admin-hint is-moss" role="status">{note}</p>}
      {error && <p className="admin-alert error" role="alert">{error}</p>}
    </section>
  )
}

// ✨ Ô trống thì máy viết lời này mỗi lần mở trang (có Gemini thì mỗi lần một
// khác). Xem thử rồi "Dùng câu này" để chép vào ô, sửa lại và lưu — từ đó trang
// quà dùng đúng câu admin viết
function GreetingPreview({ student, onUse }) {
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
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wish-block__auto">
      <p className="admin-hint">
        {student.greeting_custom
          ? <>Trang quà đang dùng <b>câu admin viết</b> ở trên. Xoá trống ô rồi Lưu chữ để máy tự viết lại.</>
          : <>Ô trống nên máy tự viết khi trang quà mở — kiểu <b>{AUDIENCE_LABELS[audience]}</b>, gọi là “{name}”.</>}
      </p>
      {preview && <blockquote className="wish-block__preview">{preview}</blockquote>}
      {preview && (
        <button type="button" className="admin-btn admin-btn--sm" onClick={() => onUse(preview)}>Dùng câu này để sửa</button>
      )}
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
            <WishBlock
              student={student}
              kind="greeting"
              field="greeting_custom"
              title="✨ Lời chúc tự động"
              hint="để trống thì máy viết, có chữ thì dùng câu này"
              placeholder="Để trống thì máy tự viết"
              onSaved={onStudentSaved}
            >
              {({ setText }) => <GreetingPreview student={student} onUse={setText} />}
            </WishBlock>
          </div>
        </article>
      ))}
    </div>
  )
}

export default PersonalWishes
