import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../api/adminApi'

function GalleryManager() {
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  const [images, setImages] = useState([])
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    adminApi.listStudents().then((data) => {
      setStudents(data)
      if (data[0]) setStudentId(String(data[0].id))
    }).catch((err) => setError(err.message))
  }, [])

  const loadGallery = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    try { setImages(await adminApi.listGallery(studentId)); setError('') }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [studentId])
  useEffect(() => {
    if (!studentId) return undefined
    let cancelled = false
    adminApi.listGallery(studentId)
      .then((data) => { if (!cancelled) { setImages(data); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [studentId])

  const upload = async (event) => {
    event.preventDefault()
    if (!file || !studentId) return
    const data = new FormData()
    data.append('student_id', studentId); data.append('caption', caption); data.append('image', file)
    setLoading(true); setError(''); setMessage('')
    try {
      await adminApi.uploadImage(data)
      setFile(null); setCaption(''); event.currentTarget.reset(); setMessage('Đã tải ảnh lên.')
      await loadGallery()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const move = async (index, direction) => {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    const reordered = [...images]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    setImages(reordered)
    try {
      await adminApi.reorderGallery(reordered.map((image, order) => ({ id: image.id, display_order: order })))
    } catch (err) { setError(err.message); await loadGallery() }
  }

  const remove = async (image) => {
    if (!window.confirm('Xóa ảnh này vĩnh viễn?')) return
    try { await adminApi.deleteImage(image.id); await loadGallery(); setMessage('Đã xóa ảnh.') }
    catch (err) { setError(err.message) }
  }

  return (
    <section>
      <header className="admin-page-header"><div><p className="admin-kicker">Gallery</p><h2>Quản lý thư viện ảnh</h2></div></header>
      <div className="admin-panel">
        <label>Chọn học sinh<select value={studentId} onChange={(e) => { setLoading(true); setStudentId(e.target.value) }}>
          {students.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}
        </select></label>
      </div>
      <form className="admin-panel admin-upload" onSubmit={upload}>
        <label>Ảnh<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" required onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <label>Chú thích<input value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
        <button className="admin-primary" disabled={loading || !file}>Tải ảnh lên</button>
      </form>
      {message && <p className="admin-alert success">{message}</p>}{error && <p className="admin-alert error">{error}</p>}
      {loading && !images.length ? <p>Đang tải...</p> : images.length ? <div className="admin-gallery-grid">
        {images.map((image, index) => <article key={image.id} className="admin-gallery-card">
          <img src={image.image_url} alt={image.caption || ''} /><p>{image.caption || 'Không có chú thích'}</p>
          <div><button disabled={index === 0} onClick={() => move(index, -1)}>←</button><button disabled={index === images.length - 1} onClick={() => move(index, 1)}>→</button><button className="danger" onClick={() => remove(image)}>Xóa</button></div>
        </article>)}
      </div> : <div className="admin-empty">Học sinh này chưa có ảnh.</div>}
    </section>
  )
}

export default GalleryManager
