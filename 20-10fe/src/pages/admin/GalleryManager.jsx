import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'
import useDialogA11y from '../../hooks/useDialogA11y'
import Polaroid from '../../components/paper/Polaroid'
import { cld, CLD_THUMB, CLD_TINY } from '../../lib/cloudinary'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 20
// heic/heif là mặc định của iPhone; Windows không có codec thì báo type rỗng,
// nên còn kiểm tra thêm theo đuôi file
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']
const ROTATIONS = [-1.5, 1, -1, 1.5, -1, 2]

function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileProblem(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const typeOk = ALLOWED_TYPES.includes(file.type) || (!file.type && ALLOWED_EXTS.includes(ext))
  if (!typeOk) return 'không phải JPG/PNG/GIF/WebP/HEIC'
  if (file.size > MAX_IMAGE_SIZE) return `${formatBytes(file.size)}, quá 5 MB`
  return null
}

function GalleryManager() {
  const location = useLocation()
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  // Nhận studentId từ query (?studentId=X, mục "Ảnh" bên trang Học sinh);
  // không tự chọn mặc định học sinh đầu tiên để tránh upload nhầm người
  const [studentId, setStudentId] = useState(
    () => new URLSearchParams(location.search).get('studentId') || '',
  )
  const [images, setImages] = useState([])
  const [captions, setCaptions] = useState({})
  const [files, setFiles] = useState([])
  const [caption, setCaption] = useState('')
  const [dragging, setDragging] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  // { done, total, name } trong lúc tải: một buổi 100 ảnh không thể ngồi nhìn
  // một chữ "Đang tải lên…" mà không biết đang ở tấm thứ mấy
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmImage, setConfirmImage] = useState(null)
  const [avatarEditing, setAvatarEditing] = useState(false)
  const [avatarDraft, setAvatarDraft] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)
  const fileInputRef = useRef(null)

  const previewItems = useMemo(() => files.map((file) => ({
    file,
    url: URL.createObjectURL(file),
  })), [files])

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === String(studentId)) || null,
    [students, studentId],
  )
  const selectedStudentName = selectedStudent?.full_name || ''

  useEffect(() => () => {
    previewItems.forEach((item) => URL.revokeObjectURL(item.url))
  }, [previewItems])

  const loadStudents = useCallback(() => (
    adminApi.listStudents().then(setStudents).catch((err) => setError(err.message))
  ), [])

  useEffect(() => {
    loadStudents()
  }, [loadStudents])

  // URL là nguồn sự thật cho học sinh đang chọn (như LetterManager): dropdown
  // chỉ navigate, effect này đọc lại — không còn hai nguồn ghi đè lẫn nhau
  useEffect(() => {
    const sync = setTimeout(() => {
      const fromUrl = new URLSearchParams(location.search).get('studentId') || ''
      if (fromUrl !== studentId) setStudentId(fromUrl)
    }, 0)
    return () => clearTimeout(sync)
  }, [location.search, studentId])

  // Đánh số mỗi lượt load: response về muộn của lượt cũ (đổi học sinh nhanh)
  // bị bỏ, không ghi đè gallery của học sinh đang chọn
  const loadSeq = useRef(0)
  const loadGallery = useCallback(async ({ preserveSuccess = false } = {}) => {
    if (!studentId) return
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const data = await adminApi.listGallery(studentId)
      if (seq !== loadSeq.current) return
      setImages(data)
      setCaptions(Object.fromEntries(data.map((image) => [image.id, image.caption || ''])))
      setError('')
    } catch (err) {
      if (seq !== loadSeq.current) return
      if (preserveSuccess) setMessage('Ảnh đã được tải lên. Nếu danh sách chưa cập nhật ngay, hãy tải lại trang.')
      else setError(err.message)
    }
    finally { if (seq === loadSeq.current) setLoading(false) }
  }, [studentId])

  // setTimeout 0 để setState không chạy đồng bộ trong effect (react-hooks v7)
  useEffect(() => {
    const initial = setTimeout(loadGallery, 0)
    return () => clearTimeout(initial)
  }, [loadGallery])

  const confirmDialogRef = useDialogA11y(Boolean(confirmImage), () => setConfirmImage(null))

  // Tấm nào lỗi thì loại riêng tấm đó và nói rõ vì sao; các tấm còn lại vẫn
  // vào hàng đợi — kéo 15 ảnh mà mất cả lô vì một tấm 6 MB là quá đau
  const chooseFiles = (fileList) => {
    setMessage('')
    const picked = Array.from(fileList || [])
    if (!picked.length) {
      setFiles([])
      return
    }
    const accepted = []
    const rejected = []
    picked.forEach((file) => {
      const problem = fileProblem(file)
      if (problem) rejected.push(`${file.name} (${problem})`)
      else if (accepted.length >= MAX_FILES) rejected.push(`${file.name} (quá ${MAX_FILES} ảnh một lần)`)
      else accepted.push(file)
    })
    setFiles(accepted)
    setError(rejected.length
      ? `Bỏ qua ${rejected.length} ảnh: ${rejected.join(', ')}`
      : '')
  }

  const removeQueued = (index) => {
    setFiles((current) => current.filter((_, i) => i !== index))
  }

  const clearQueue = () => {
    setFiles([])
    setCaption('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Gửi từng tấm một: có tiến độ thật, một tấm hỏng không kéo cả lô đổ theo,
  // và F5 giữa chừng chỉ mất tối đa tấm đang gửi thay vì cả 20 tấm
  const upload = async (event) => {
    event.preventDefault()
    if (!files.length || !studentId || uploading) return
    const queue = [...files]
    setUploading(true); setError(''); setMessage('')
    const uploadedAll = []
    let failedAt = -1
    let failMessage = ''
    for (let i = 0; i < queue.length; i += 1) {
      const file = queue[i]
      setProgress({ done: i, total: queue.length, name: file.name })
      const data = new FormData()
      data.append('student_id', studentId)
      data.append('caption', caption)
      data.append('images', file)
      try {
        const uploaded = await adminApi.uploadImage(data)
        const list = Array.isArray(uploaded) ? uploaded : [uploaded]
        uploadedAll.push(...list)
        setImages((current) => [
          ...current,
          ...list.map((image, index) => ({ ...image, caption, display_order: current.length + index })),
        ])
        setCaptions((current) => ({
          ...current,
          ...Object.fromEntries(list.map((image) => [image.id, caption])),
        }))
      } catch (err) {
        failedAt = i
        failMessage = err.message
        break
      }
    }
    setProgress(null)
    if (failedAt === -1) {
      clearQueue()
      setMessage(`Đã tải lên ${uploadedAll.length} ảnh.`)
    } else {
      // Giữ lại tấm lỗi và các tấm chưa gửi; những tấm đã lên thì bỏ khỏi hàng đợi
      setFiles(queue.slice(failedAt))
      setError(`Dừng ở ảnh "${queue[failedAt].name}": ${failMessage}`)
      if (uploadedAll.length) setMessage(`Đã tải lên ${uploadedAll.length} ảnh trước khi gặp lỗi.`)
    }
    try {
      await loadGallery({ preserveSuccess: true })
      loadStudents()
    } finally {
      setUploading(false)
    }
  }

  const reorderFromTo = async (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return
    const reordered = [...images]
    const [item] = reordered.splice(from, 1)
    reordered.splice(to, 0, item)
    setImages(reordered)
    try {
      await adminApi.reorderGallery(reordered.map((image, order) => ({ id: image.id, display_order: order })))
    } catch (err) { setError(err.message); await loadGallery() }
  }

  const move = async (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    await reorderFromTo(index, target)
  }

  // Clear trước khi set để toast remount và chạy lại animation cho mỗi thông báo
  const saveCaption = async (image) => {
    setMessage('')
    setError('')
    try {
      await adminApi.updateImageCaption(image.id, captions[image.id] || '')
      setMessage('Đã cập nhật chú thích.')
      await loadGallery()
    } catch (err) { setError(err.message) }
  }

  const remove = async () => {
    const image = confirmImage
    setConfirmImage(null)
    if (!image) return
    setMessage('')
    setError('')
    try { await adminApi.deleteImage(image.id); await loadGallery(); loadStudents(); setMessage('Đã xóa ảnh.') }
    catch (err) { setError(err.message) }
  }

  // Ảnh đại diện là URL của một ảnh trong thư viện — cách chính là bấm nút
  // trên thẻ ảnh; ô dán link chỉ để dự phòng
  const isAvatar = (image) => Boolean(selectedStudent?.avatar_url) && image.image_url === selectedStudent.avatar_url

  const setAsAvatar = async (image) => {
    if (!selectedStudent) return
    setMessage('')
    setError('')
    try {
      await adminApi.updateStudent(selectedStudent.id, { avatar_url: image.image_url })
      setMessage(`Đã đặt ảnh này làm ảnh đại diện của ${selectedStudentName}.`)
      await loadStudents()
    } catch (err) {
      setError(err.message)
    }
  }

  const startAvatarEdit = () => {
    setAvatarDraft(selectedStudent?.avatar_url || '')
    setAvatarBroken(false)
    setAvatarEditing(true)
  }

  const saveAvatar = async (event) => {
    event.preventDefault()
    if (!selectedStudent) return
    setAvatarSaving(true)
    setMessage('')
    setError('')
    try {
      await adminApi.updateStudent(selectedStudent.id, { avatar_url: avatarDraft.trim() || null })
      setAvatarEditing(false)
      setMessage(avatarDraft.trim() ? 'Đã đổi ảnh đại diện.' : 'Đã bỏ ảnh đại diện.')
      await loadStudents()
    } catch (err) {
      setError(err.message)
    } finally {
      setAvatarSaving(false)
    }
  }

  const initial = (selectedStudent?.nickname || selectedStudent?.full_name || '?').trim().charAt(0).toUpperCase()
  const avatarPreview = avatarEditing ? avatarDraft.trim() : (selectedStudent?.avatar_url || '')
  const progressPercent = progress ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Thư viện ảnh</p>
          <h2>
            {selectedStudentName
              ? <>Album của <span className="accent">{selectedStudentName}</span></>
              : 'Album lớp'}
          </h2>
        </div>
        <select
          className="admin-select admin-select--hand"
          aria-label="Chọn học sinh"
          value={studentId}
          onChange={(e) => {
            const value = e.target.value
            navigate(value ? `/admin/gallery?studentId=${value}` : '/admin/gallery', { replace: true })
          }}
        >
          <option value="">— Chọn học sinh —</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.full_name}{student.gallery_count !== undefined ? ` · ${student.gallery_count} ảnh` : ''}{student.member_type !== 'friend' && !student.avatar_url ? ' · chưa có ảnh đại diện' : ''}
            </option>
          ))}
        </select>
      </header>

      {message && <p key={message} className="admin-alert success" role="status">{message}</p>}
      {error && <p key={error} className="admin-alert error" role="alert">{error}</p>}

      {!studentId ? (
        <div className="admin-empty">Chọn một học sinh để xem và tải ảnh.</div>
      ) : (
        <>
          <form className="gallery-top" onSubmit={upload}>
            <div>
              <label
                className={`admin-dropzone${dragging ? ' dragging' : ''}`}
                onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  chooseFiles(event.dataTransfer.files)
                }}
              >
                Kéo ảnh vào đây hoặc <u>chọn từ máy</u>
                <small>JPG · PNG · WebP · HEIC · tối đa 5 MB/ảnh · tối đa {MAX_FILES} ảnh cùng lúc</small>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,.heic,.heif"
                  onChange={(e) => chooseFiles(e.target.files)}
                />
              </label>
              {previewItems.length > 0 && (
                <div className="upload-queue">
                  <div className="upload-queue__previews">
                    {previewItems.map((item, index) => (
                      <div key={`${item.file.name}-${item.file.size}-${index}`} className="upload-queue__item">
                        <Polaroid
                          src={item.url}
                          alt={`Ảnh sắp tải lên ${item.file.name}`}
                          caption={formatBytes(item.file.size)}
                          small
                          rotate={ROTATIONS[index % ROTATIONS.length]}
                          tape="none"
                        />
                        {!uploading && (
                          <button
                            type="button"
                            className="upload-queue__remove"
                            onClick={() => removeQueued(index)}
                            aria-label={`Bỏ ảnh ${item.file.name} khỏi hàng đợi`}
                            title={item.file.name}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <label className="admin-field upload-queue__caption">
                    Chú thích chung (tùy chọn)
                    <input className="input-hand" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} placeholder="Ví dụ: Đi chơi biển hè năm ấy" disabled={uploading} />
                  </label>
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={uploading}>
                    {uploading
                      ? (progress ? `Đang tải ảnh ${progress.done + 1}/${progress.total}…` : 'Đang tải lên…')
                      : `Tải ${files.length} ảnh lên`}
                  </button>
                  <button type="button" className="admin-btn" onClick={clearQueue} disabled={uploading}>Bỏ</button>
                  {progress && (
                    <div className="upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Tiến độ tải ảnh">
                      <span style={{ width: `${progressPercent}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="admin-card avatar-box">
              <b>Ảnh đại diện</b>
              <div className="avatar-box__row">
                <span className="avatar-stamp" aria-hidden="true">
                  {avatarPreview && !avatarBroken
                    ? <img src={cld(avatarPreview, CLD_TINY)} alt="" onError={() => setAvatarBroken(true)} />
                    : initial}
                </span>
                {!avatarEditing && (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={startAvatarEdit}>
                    {selectedStudent?.avatar_url ? 'Dán link khác' : 'Dán link'}
                  </button>
                )}
              </div>
              <p className="avatar-box__hint">
                {selectedStudent?.avatar_url
                  ? 'Muốn đổi: bấm "Đặt làm ảnh đại diện" trên một tấm khác trong album.'
                  : 'Chưa có. Bấm "Đặt làm ảnh đại diện" trên một tấm trong album bên dưới.'}
              </p>
              {avatarEditing && (
                <div style={{ marginTop: 10 }}>
                  <label className="admin-field">
                    Link ảnh trong thư viện (để trống = bỏ ảnh)
                    <input
                      className="input-hand"
                      value={avatarDraft}
                      onChange={(e) => { setAvatarBroken(false); setAvatarDraft(e.target.value) }}
                      maxLength={500}
                      placeholder="https://res.cloudinary.com/…"
                    />
                  </label>
                  {avatarBroken && avatarDraft.trim() && (
                    <p className="admin-hint is-clay">Không tải được ảnh từ link này. Chỉ nhận ảnh đã tải lên thư viện (res.cloudinary.com).</p>
                  )}
                  <div className="admin-inline" style={{ marginTop: 8 }}>
                    <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={saveAvatar} disabled={avatarSaving}>{avatarSaving ? 'Đang lưu…' : 'Lưu'}</button>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => { setAvatarEditing(false); setAvatarBroken(false) }} disabled={avatarSaving}>Hủy</button>
                  </div>
                </div>
              )}
            </div>
          </form>

          {loading && !images.length ? <p className="admin-loading">Đang tải…</p> : images.length ? (
            <>
              <p className="admin-hint">Kéo polaroid để đổi thứ tự — thứ tự này là thứ tự hiện trên trang quà.</p>
              <div className="gallery-admin">
                {images.map((image, index) => {
                  const avatar = isAvatar(image)
                  return (
                    <article
                      key={image.id}
                      className={`gallery-admin__card${avatar ? ' is-avatar' : ''}${draggedIndex === index ? ' is-dragging' : ''}${overIndex === index && draggedIndex !== null && draggedIndex !== index ? ' is-over' : ''}`}
                      style={{ '--rot': `${ROTATIONS[index % ROTATIONS.length]}deg` }}
                      draggable
                      onDragStart={() => setDraggedIndex(index)}
                      onDragOver={(event) => { event.preventDefault(); if (overIndex !== index) setOverIndex(index) }}
                      onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
                      onDrop={() => {
                        if (draggedIndex !== null) reorderFromTo(draggedIndex, index)
                        setDraggedIndex(null)
                        setOverIndex(null)
                      }}
                      onDragEnd={() => { setDraggedIndex(null); setOverIndex(null) }}
                    >
                      <span className="gallery-admin__order" aria-hidden="true">⠿ {draggedIndex === index ? 'đang kéo' : index + 1}</span>
                      {avatar && <span className="gallery-admin__badge">Ảnh đại diện</span>}
                      <img className="gallery-admin__img" src={cld(image.image_url, CLD_THUMB)} alt={image.caption || ''} loading="lazy" />
                      <input
                        className="gallery-admin__caption"
                        value={captions[image.id] || ''}
                        onChange={(e) => setCaptions({ ...captions, [image.id]: e.target.value })}
                        maxLength={500}
                        placeholder="Chú thích…"
                        aria-label={`Chú thích ảnh ${index + 1}`}
                      />
                      <div className="gallery-admin__actions">
                        <div className="gallery-admin__move">
                          <button type="button" className="admin-btn admin-btn--sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Chuyển lên trước">←</button>
                          <button type="button" className="admin-btn admin-btn--sm" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label="Chuyển ra sau">→</button>
                        </div>
                        <button type="button" className="admin-btn admin-btn--sm" onClick={() => saveCaption(image)}>Lưu chú thích</button>
                        <button
                          type="button"
                          className={`admin-btn admin-btn--sm${avatar ? '' : ' admin-btn--primary'}`}
                          disabled={avatar}
                          onClick={() => setAsAvatar(image)}
                        >
                          {avatar ? '✓ Ảnh đại diện' : 'Đặt làm ảnh đại diện'}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--sm admin-btn--ghost"
                          disabled={avatar}
                          title={avatar ? 'Đang là ảnh đại diện — đặt tấm khác làm ảnh đại diện rồi mới xóa được' : undefined}
                          onClick={() => setConfirmImage(image)}
                        >
                          Xóa
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="admin-empty">Học sinh này chưa có ảnh — kéo ảnh vào ô phía trên để bắt đầu album.</div>
          )}
        </>
      )}

      {confirmImage && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setConfirmImage(null)}>
          <section ref={confirmDialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-image-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="delete-image-title">Xóa ảnh</h3>
            <p>Ảnh này sẽ bị xóa vĩnh viễn khỏi thư viện.</p>
            <div className="admin-form-actions">
              <button type="button" className="admin-btn admin-btn--primary" onClick={remove}>Xóa ảnh</button>
              <button type="button" className="admin-btn" onClick={() => setConfirmImage(null)}>Hủy</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default GalleryManager
