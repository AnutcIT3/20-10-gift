import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminApi } from '../../api/adminApi'
import useDialogA11y from '../../hooks/useDialogA11y'
import Polaroid from '../../components/paper/Polaroid'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 20
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ROTATIONS = [-1.5, 1, -1, 1.5, -1, 2]

function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmImage, setConfirmImage] = useState(null)
  const [avatarEditing, setAvatarEditing] = useState(false)
  const [avatarDraft, setAvatarDraft] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)
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

  const chooseFiles = (fileList) => {
    setMessage('')
    const nextFiles = Array.from(fileList || [])
    if (!nextFiles.length) {
      setFiles([])
      return
    }
    if (nextFiles.length > MAX_FILES) {
      setError(`Mỗi lần chỉ được tải tối đa ${MAX_FILES} ảnh.`)
      setFiles([])
      return
    }
    const invalidType = nextFiles.find((item) => !ALLOWED_TYPES.includes(item.type))
    if (invalidType) {
      setError('Ảnh phải là JPG, PNG, GIF hoặc WebP.')
      setFiles([])
      return
    }
    const oversized = nextFiles.find((item) => item.size > MAX_IMAGE_SIZE)
    if (oversized) {
      setError('Ảnh tối đa 5 MB.')
      setFiles([])
      return
    }
    setError('')
    setFiles(nextFiles)
  }

  const clearQueue = () => {
    setFiles([])
    setCaption('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const upload = async (event) => {
    event.preventDefault()
    if (!files.length || !studentId) return
    const data = new FormData()
    data.append('student_id', studentId); data.append('caption', caption)
    files.forEach((file) => data.append('images', file))
    setUploading(true); setError(''); setMessage('')
    try {
      const uploaded = await adminApi.uploadImage(data)
      const uploadedImages = Array.isArray(uploaded) ? uploaded : [uploaded]
      clearQueue()
      setMessage(`Đã tải lên ${uploadedImages.length} ảnh.`)
      if (uploadedImages.length) {
        setImages((current) => [
          ...current,
          ...uploadedImages.map((image, index) => ({ ...image, caption, display_order: current.length + index })),
        ])
        setCaptions((current) => ({
          ...current,
          ...Object.fromEntries(uploadedImages.map((image) => [image.id, caption])),
        }))
      }
      await loadGallery({ preserveSuccess: true })
      loadStudents()
    } catch (err) { setError(`Không thể tải ảnh lên: ${err.message}`) }
    finally { setUploading(false) }
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

  // Ảnh đại diện là một URL (không có API upload riêng) — sửa tại chỗ
  const startAvatarEdit = () => {
    setAvatarDraft(selectedStudent?.avatar_url || '')
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
              {student.full_name}{student.gallery_count !== undefined ? ` · ${student.gallery_count} ảnh` : ''}
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
                <small>JPG · PNG · GIF · WebP · tối đa 5 MB/ảnh · tối đa {MAX_FILES} ảnh cùng lúc</small>
                <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => chooseFiles(e.target.files)} />
              </label>
              {previewItems.length > 0 && (
                <div className="upload-queue">
                  <div className="upload-queue__previews">
                    {previewItems.slice(0, 4).map((item, index) => (
                      <Polaroid
                        key={`${item.file.name}-${item.file.size}`}
                        src={item.url}
                        alt={`Ảnh sắp tải lên ${item.file.name}`}
                        caption={formatBytes(item.file.size)}
                        small
                        rotate={ROTATIONS[index % ROTATIONS.length]}
                        tape="none"
                      />
                    ))}
                    {previewItems.length > 4 && <span className="admin-hint" style={{ alignSelf: 'center' }}>+{previewItems.length - 4} ảnh khác</span>}
                  </div>
                  <label className="admin-field upload-queue__caption">
                    Chú thích chung (tùy chọn)
                    <input className="input-hand" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} placeholder="Ví dụ: Đi chơi biển hè năm ấy" />
                  </label>
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={uploading}>
                    {uploading ? 'Đang tải lên…' : `Tải ${files.length} ảnh lên`}
                  </button>
                  <button type="button" className="admin-btn" onClick={clearQueue} disabled={uploading}>Bỏ</button>
                </div>
              )}
            </div>
            <div className="admin-card avatar-box">
              <b>Ảnh đại diện</b>
              <div className="avatar-box__row">
                <span className="avatar-stamp" aria-hidden="true">
                  {selectedStudent?.avatar_url ? <img src={selectedStudent.avatar_url} alt="" /> : initial}
                </span>
                {!avatarEditing && (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={startAvatarEdit}>Đổi ảnh</button>
                )}
              </div>
              {avatarEditing && (
                <div style={{ marginTop: 10 }}>
                  <label className="admin-field">
                    URL ảnh đại diện (để trống = bỏ ảnh)
                    <input className="input-hand" value={avatarDraft} onChange={(e) => setAvatarDraft(e.target.value)} maxLength={500} placeholder="https://…" />
                  </label>
                  <div className="admin-inline" style={{ marginTop: 8 }}>
                    <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={saveAvatar} disabled={avatarSaving}>{avatarSaving ? 'Đang lưu…' : 'Lưu'}</button>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => setAvatarEditing(false)} disabled={avatarSaving}>Hủy</button>
                  </div>
                </div>
              )}
            </div>
          </form>

          {loading && !images.length ? <p className="admin-loading">Đang tải…</p> : images.length ? (
            <>
              <p className="admin-hint">Kéo polaroid để đổi thứ tự — thứ tự này là thứ tự hiện trên trang quà.</p>
              <div className="gallery-admin">
                {images.map((image, index) => (
                  <article
                    key={image.id}
                    className={`gallery-admin__card${draggedIndex === index ? ' is-dragging' : ''}${overIndex === index && draggedIndex !== null && draggedIndex !== index ? ' is-over' : ''}`}
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
                    <img className="gallery-admin__img" src={image.image_url} alt={image.caption || ''} loading="lazy" />
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
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => setConfirmImage(image)}>Xóa</button>
                    </div>
                  </article>
                ))}
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
