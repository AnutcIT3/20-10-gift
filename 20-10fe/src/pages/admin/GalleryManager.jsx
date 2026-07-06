import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../api/adminApi'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 20
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function GalleryManager() {
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [images, setImages] = useState([])
  const [captions, setCaptions] = useState({})
  const [files, setFiles] = useState([])
  const [caption, setCaption] = useState('')
  const [dragging, setDragging] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmImage, setConfirmImage] = useState(null)

  const previewItems = useMemo(() => files.map((file) => ({
    file,
    url: URL.createObjectURL(file),
  })), [files])

  useEffect(() => () => {
    previewItems.forEach((item) => URL.revokeObjectURL(item.url))
  }, [previewItems])

  useEffect(() => {
    adminApi.listStudents().then((data) => {
      setStudents(data)
      if (data[0]) setStudentId(String(data[0].id))
    }).catch((err) => setError(err.message))
  }, [])

  const loadGallery = useCallback(async ({ preserveSuccess = false } = {}) => {
    if (!studentId) return
    setLoading(true)
    try {
      const data = await adminApi.listGallery(studentId)
      setImages(data)
      setCaptions(Object.fromEntries(data.map((image) => [image.id, image.caption || ''])))
      setError('')
    } catch (err) {
      if (preserveSuccess) setMessage('Ảnh đã được tải lên. Nếu danh sách chưa cập nhật ngay, hãy tải lại trang.')
      else setError(err.message)
    }
    finally { setLoading(false) }
  }, [studentId])

  useEffect(() => {
    if (!studentId) return undefined
    let cancelled = false
    adminApi.listGallery(studentId)
      .then((data) => {
        if (!cancelled) {
          setImages(data)
          setCaptions(Object.fromEntries(data.map((image) => [image.id, image.caption || ''])))
          setError('')
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [studentId])

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
      setFiles([]); setCaption(''); event.currentTarget.reset(); setMessage(`Đã tải lên ${uploadedImages.length} ảnh.`)
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
    } catch (err) { setError(`Không thể tải ảnh lên: ${err.message}`) }
    finally { setUploading(false) }
  }

  const move = async (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    await reorderFromTo(index, target)
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

  const saveCaption = async (image) => {
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
    try { await adminApi.deleteImage(image.id); await loadGallery(); setMessage('Đã xóa ảnh.') }
    catch (err) { setError(err.message) }
  }

  return (
    <section>
      <header className="admin-page-header"><div><p className="admin-kicker">Thư viện ảnh</p><h2>Quản lý thư viện ảnh</h2></div></header>
      <div className="admin-panel">
        <label>Chọn học sinh<select value={studentId} onChange={(e) => { setLoading(true); setStudentId(e.target.value) }}>
          {students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}
        </select></label>
      </div>
      <form className="admin-panel admin-upload" onSubmit={upload}>
        <label
          className={`admin-dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            chooseFiles(event.dataTransfer.files)
          }}
        >
          Ảnh
          <input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => chooseFiles(e.target.files)} />
          <span>Kéo thả tối đa {MAX_FILES} ảnh vào đây hoặc bấm để chọn.</span>
        </label>
        <label>Chú thích<input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} /></label>
        {previewItems.length > 0 && <div className="admin-upload-preview multi">{previewItems.slice(0, 4).map((item) => <div key={`${item.file.name}-${item.file.size}`}><img src={item.url} alt="Preview ảnh upload" /><p>{item.file.name} · {formatBytes(item.file.size)}</p></div>)}{previewItems.length > 4 && <p>+{previewItems.length - 4} ảnh khác</p>}</div>}
        <button type="submit" className="admin-primary" disabled={uploading || !files.length}>{uploading ? 'Đang tải lên...' : `Tải ${files.length || ''} ảnh lên`}</button>
      </form>
      {message && <p className="admin-alert success" role="status">{message}</p>}{error && <p className="admin-alert error" role="alert">{error}</p>}
      {loading && !images.length ? <p>Đang tải...</p> : images.length ? <div className="admin-gallery-grid">
        {images.map((image, index) => <article
          key={image.id}
          className="admin-gallery-card"
          draggable
          onDragStart={() => setDraggedIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (draggedIndex !== null) reorderFromTo(draggedIndex, index)
            setDraggedIndex(null)
          }}
          onDragEnd={() => setDraggedIndex(null)}
        >
          <img src={image.image_url} alt={image.caption || ''} />
          <label>Chú thích<input value={captions[image.id] || ''} onChange={(e) => setCaptions({ ...captions, [image.id]: e.target.value })} maxLength={500} /></label>
          <div><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>←</button><button type="button" disabled={index === images.length - 1} onClick={() => move(index, 1)}>→</button><button type="button" onClick={() => saveCaption(image)}>Lưu chú thích</button><button type="button" className="danger" onClick={() => setConfirmImage(image)}>Xóa</button></div>
        </article>)}
      </div> : <div className="admin-empty">Học sinh này chưa có ảnh.</div>}
      {confirmImage && (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setConfirmImage(null)}>
          <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-image-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="delete-image-title">Xóa ảnh</h3>
            <p>Ảnh này sẽ bị xóa vĩnh viễn khỏi thư viện.</p>
            <div className="admin-form-actions">
              <button type="button" className="danger" onClick={remove}>Xóa ảnh</button>
              <button type="button" onClick={() => setConfirmImage(null)}>Hủy</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default GalleryManager
