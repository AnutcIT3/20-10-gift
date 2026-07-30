import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import EmptyState from './EmptyState'

function LazyImage({ src, alt, onClick }) {
  const imgRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [inView, setInView] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <button ref={imgRef} type="button" className={`gallery-item ${loaded || failed ? 'loaded' : ''}`} onClick={onClick}>
      {inView && !failed && (
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="gallery-img"
        />
      )}
      {failed && <span className="gallery-image-fallback" role="img" aria-label="Ảnh không thể tải">🖼️</span>}
    </button>
  )
}

function PhotoGallery({ images = [] }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const touchStartRef = useRef(null)

  const openLightbox = useCallback((index) => {
    previousFocusRef.current = document.activeElement
    setLightboxIndex(index)
  }, [])
  const closeLightbox = useCallback(() => setLightboxIndex(null), [])
  const showPrevious = useCallback(() => setLightboxIndex((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length])
  const showNext = useCallback(() => setLightboxIndex((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    const dialog = dialogRef.current
    dialog?.querySelector('.lightbox-close')?.focus()
    const handleKey = (e) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') showPrevious()
      if (e.key === 'ArrowRight') showNext()
      if (e.key === 'Tab' && dialog) {
        const focusable = [...dialog.querySelectorAll('button:not(:disabled)')]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [lightboxIndex, closeLightbox, showPrevious, showNext])

  const handleTouchStart = (event) => {
    touchStartRef.current = event.changedTouches[0].clientX
  }

  const handleTouchEnd = (event) => {
    if (touchStartRef.current === null) return
    const delta = event.changedTouches[0].clientX - touchStartRef.current
    touchStartRef.current = null
    if (Math.abs(delta) < 45) return
    if (delta > 0) showPrevious()
    else showNext()
  }

  if (!images.length) {
    return (
      <section className="gallery-section">
        <h2 className="section-title">📸 Kỷ niệm</h2>
        <EmptyState icon="📷" message="Chưa có ảnh nào..." />
      </section>
    )
  }

  return (
    <section className="gallery-section">
      <h2 className="section-title">📸 Kỷ niệm</h2>
      <div className="gallery-grid">
        {images.map((img, index) => (
          <div key={img.id} className="gallery-card">
            <LazyImage src={img.image_url} alt={img.caption || ''} onClick={() => openLightbox(index)} />
            {img.caption && <p className="gallery-caption">{img.caption}</p>}
          </div>
        ))}
      </div>

      {lightboxIndex !== null && createPortal(
        <div
          ref={dialogRef}
          className="lightbox-overlay"
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh"
        >
          <button type="button" className="lightbox-close" onClick={closeLightbox} aria-label="Đóng">
            ✕
          </button>
          <button
            type="button"
            className="lightbox-nav lightbox-prev"
            onClick={(e) => {
              e.stopPropagation()
              showPrevious()
            }}
            aria-label="Ảnh trước"
          >
            ‹
          </button>
          <img
            src={images[lightboxIndex].image_url}
            alt={images[lightboxIndex].caption || ''}
            className="lightbox-img"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="lightbox-nav lightbox-next"
            onClick={(e) => {
              e.stopPropagation()
              showNext()
            }}
            aria-label="Ảnh sau"
          >
            ›
          </button>
          {images[lightboxIndex].caption && (
            <p className="lightbox-caption">{images[lightboxIndex].caption}</p>
          )}
          <p className="lightbox-counter">
            {lightboxIndex + 1} / {images.length}
          </p>
        </div>,
        document.body,
      )}
    </section>
  )
}

export default PhotoGallery
