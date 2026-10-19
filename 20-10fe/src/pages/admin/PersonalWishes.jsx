import { useEffect, useRef, useState } from 'react'
import { adminApi } from '../../api/adminApi'
import Polaroid from '../../components/paper/Polaroid'
import { MAX_WISH_IMAGES, WISH_IMAGE_ACCEPT, WISH_IMAGE_TYPES } from '../../hooks/useImagePicks'
import { AUDIENCE_LABELS, greetingRequest } from '../../lib/greeting'
import { MAX_WISH_NOTES, wishImages } from '../../lib/images'

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

// Gọi API, đưa hồ sơ mới lên trang cha, báo kết quả ngay dưới khối đang sửa
function useRunner(onSaved) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const run = async (action, done) => {
    setBusy(true); setError(''); setNote('')
    try {
      onSaved(await action())
      setNote(done)
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const fail = (message) => { setError(message); setNote('') }
  const status = (
    <>
      {busy && <p className="admin-hint">Đang lưu…</p>}
      {note && <p className="admin-hint is-moss" role="status">{note}</p>}
      {error && <p className="admin-alert error" role="alert">{error}</p>}
    </>
  )
  return { busy, run, fail, status }
}

// Ảnh kèm một lời (tối đa 4): từng ảnh có nút bỏ, chọn một lúc nhiều ảnh
function ImageStrip({ images, label, itemAlt, inputLabel, busy, onAdd, onRemove, onRemoveAll, onProblem }) {
  const fileRef = useRef(null)
  const room = MAX_WISH_IMAGES - images.length

  const choose = (fileList) => {
    const files = Array.from(fileList || [])
    if (fileRef.current) fileRef.current.value = ''
    if (!files.length) return
    const problem = imageProblem(files, room)
    if (problem) { onProblem(problem); return }
    onAdd(files)
  }

  return (
    <>
      {images.length > 0 && (
        <ul className="wish-block__images" aria-label={label}>
          {images.map((image, index) => (
            <li key={image.id ?? image.url}>
              <Polaroid src={image.url} alt={`Ảnh ${index + 1} ${itemAlt}`} small rotate={index % 2 ? 2 : -2} tape="none" />
              <button
                type="button"
                className="admin-btn admin-btn--sm admin-btn--danger"
                onClick={() => onRemove(image)}
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
          aria-label={inputLabel}
          onChange={(event) => choose(event.target.files)}
        />
        {images.length > 1 && (
          <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" onClick={onRemoveAll} disabled={busy}>Bỏ hết ảnh</button>
        )}
      </div>
    </>
  )
}

// Một lời nhắn THÊM (lời thứ 2–4) của lời chúc riêng / 💌: chữ, ảnh riêng, xoá được
function ExtraNote({ student, item, index, title, onSaved }) {
  const { busy, run, fail, status } = useRunner(onSaved)
  const saved = item.content || ''
  const [text, setText] = useState(saved)
  useEffect(() => {
    const sync = setTimeout(() => setText(saved), 0)
    return () => clearTimeout(sync)
  }, [saved])
  const label = `${title} — lời ${index} của ${student.full_name}`

  const save = () => {
    if (!text.trim()) { fail('Lời nhắn không được để trống — muốn bỏ thì bấm "Xoá lời này".'); return }
    run(() => adminApi.updateWishNote(student.id, item.id, text.trim()), 'Đã lưu lời nhắn.')
  }
  const remove = () => {
    if (!window.confirm(`Xoá lời ${index} (cả ảnh kèm)?`)) return
    run(() => adminApi.removeWishNote(student.id, item.id), 'Đã xoá lời nhắn.')
  }

  return (
    <div className="wish-note" role="group" aria-label={label}>
      <p className="wish-note__index">Lời {index}</p>
      <textarea
        className="input-hand wish-block__text"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label={label}
      />
      <div className="wish-note__actions">
        <button type="button" className="admin-btn admin-btn--sm" onClick={save} disabled={busy || text === saved}>Lưu chữ</button>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" onClick={remove} disabled={busy}>Xoá lời này</button>
      </div>
      <ImageStrip
        images={item.images || []}
        label={`Ảnh kèm lời ${index}`}
        itemAlt={`kèm lời ${index}`}
        inputLabel={`Ảnh kèm ${label}`}
        busy={busy}
        onProblem={fail}
        onAdd={(files) => run(() => adminApi.addWishNoteImages(student.id, item.id, files), `Đã thêm ${files.length} ảnh.`)}
        onRemove={(image) => run(() => adminApi.removeWishNoteImage(student.id, item.id, image.id), 'Đã bỏ ảnh.')}
        onRemoveAll={async () => {
          for (const image of item.images || []) {
            if (!(await run(() => adminApi.removeWishNoteImage(student.id, item.id, image.id), 'Đã bỏ hết ảnh.'))) return
          }
        }}
      />
      {status}
    </div>
  )
}

// Lời thứ 2–4 và nút "+ Thêm lời nhắn": lời mới viết xong bấm Lưu mới có, rồi
// mới kèm ảnh được
function ExtraNotes({ student, kind, title, onSaved }) {
  const notes = student[`${kind}_notes`] || []
  const total = 1 + notes.length
  const { busy, run, fail, status } = useRunner(onSaved)
  const [draft, setDraft] = useState(null)

  const create = async () => {
    if (!draft?.trim()) { fail('Viết lời nhắn trước khi lưu.'); return }
    if (await run(() => adminApi.addWishNote(student.id, kind, draft.trim()), 'Đã thêm lời nhắn — giờ có thể kèm ảnh.')) setDraft(null)
  }

  return (
    <div className="wish-notes">
      {notes.map((item, index) => (
        <ExtraNote key={item.id} student={student} item={item} index={index + 2} title={title} onSaved={onSaved} />
      ))}
      {draft !== null ? (
        <div className="wish-note" role="group" aria-label={`${title} — lời mới của ${student.full_name}`}>
          <p className="wish-note__index">Lời {total + 1}</p>
          <textarea
            className="input-hand wish-block__text"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`${title} — lời mới của ${student.full_name}`}
            placeholder="Viết thêm một lời nhắn…"
          />
          <div className="wish-note__actions">
            <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={create} disabled={busy}>Lưu lời nhắn</button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setDraft(null)} disabled={busy}>Huỷ</button>
          </div>
          <p className="admin-hint">Lưu xong mới kèm ảnh được (tối đa {MAX_WISH_IMAGES} ảnh mỗi lời).</p>
        </div>
      ) : (
        <button type="button" className="admin-btn admin-btn--sm wish-notes__add" onClick={() => setDraft('')} disabled={busy || total >= MAX_WISH_NOTES}>
          {total >= MAX_WISH_NOTES ? `Đủ ${MAX_WISH_NOTES} lời nhắn` : `+ Thêm lời nhắn (${total}/${MAX_WISH_NOTES})`}
        </button>
      )}
      {status}
    </div>
  )
}

// Một loại lời chúc của một bạn: chữ sửa được và ảnh kèm. children có thể là
// hàm nhận { setText } — phần xem thử lời chúc tự động dùng để chép câu máy viết vào ô.
// withNotes: lời chúc riêng và 💌 có thêm được lời nhắn (tối đa 4 lời)
function WishBlock({
  student, kind, title, hint, field, onSaved, children, withNotes = false, placeholder = 'Để trống thì không hiện gì',
}) {
  const images = wishImages(student, kind)
  const saved = field ? (student[field] || '') : ''
  const [text, setText] = useState(saved)
  const { busy, run, fail, status } = useRunner(onSaved)

  // Chữ đã lưu đổi từ nơi khác (trang Học sinh, máy khác) thì ô theo kịp
  useEffect(() => {
    const sync = setTimeout(() => setText(saved), 0)
    return () => clearTimeout(sync)
  }, [saved])

  const saveText = () => run(() => adminApi.updateStudent(student.id, { [field]: text.trim() || null }), 'Đã lưu chữ.')

  return (
    <section className="wish-block" aria-label={`${title} — ${student.full_name}`}>
      <h4 className="wish-block__title">{title} <small>{hint}</small></h4>
      {withNotes && <p className="wish-note__index">Lời 1</p>}
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
      <ImageStrip
        images={images}
        label={`Ảnh kèm ${title.toLowerCase()}`}
        itemAlt={`kèm ${title.toLowerCase()}`}
        inputLabel={`Ảnh kèm ${title.toLowerCase()} của ${student.full_name}`}
        busy={busy}
        onProblem={fail}
        onAdd={(files) => run(() => adminApi.addWishImages(student.id, kind, files), `Đã thêm ${files.length} ảnh.`)}
        // Ảnh chưa có id là ảnh ở cột cũ (máy chủ chưa cập nhật) — bỏ hết là bỏ nó
        onRemove={(image) => run(
          () => (image.id ? adminApi.removeWishImage(student.id, kind, image.id) : adminApi.clearWishImages(student.id, kind)),
          'Đã bỏ ảnh.',
        )}
        onRemoveAll={() => run(() => adminApi.clearWishImages(student.id, kind), 'Đã bỏ hết ảnh.')}
      />
      {status}
      {withNotes && <ExtraNotes student={student} kind={kind} title={title} onSaved={onSaved} />}
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
 * động. Lời chúc riêng và 💌 được tới 4 lời mỗi loại; mỗi lời kèm tối đa 4 ảnh.
 * Trên trang quà chúng vẫn nằm đúng chỗ cũ.
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
            <WishBlock student={student} kind="intro" field="intro_message" title="Lời chúc riêng" hint="hiện ngay dưới tên" withNotes onSaved={onStudentSaved} />
            <WishBlock student={student} kind="admin_wish" field="admin_wish" title="💌 Lời chúc từ admin" hint="mỗi lời một ô trên trang quà" withNotes onSaved={onStudentSaved} />
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
