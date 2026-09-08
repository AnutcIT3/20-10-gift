import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Polaroid from './paper/Polaroid'

// Polaroid xoay xen kẽ, tấm chẵn hạ xuống một chút, băng keo đổi góc luân phiên
const ROTATIONS = [-3, 2, -1.5, 2.5, -2, 1.5]
const LIFTS = [0, 12, 0, 6, 16, 0]
const TAPES = ['left', 'center', 'right']
const TAPE_ROTATIONS = [3, -3, 2]

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
    dialog?.querySelector('.lightbox__close')?.focus()
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

  const count = images.length

  return (
    <section className="gift__section" aria-labelledby="gallery-title">
      <h2 id="gallery-title" className="section-title">
        Kỷ niệm
        <span className="section-title__count">{count ? `${count} tấm ảnh` : 'chưa có ảnh'}</span>
      </h2>
      {count === 0 ? (
        <Polaroid caption="Chưa có ảnh nào…" fallback="📷" rotate={-2} className="gallery__empty" />
      ) : (
        <div className="gallery">
          {images.map((img, index) => (
            <Polaroid
              key={img.id}
              src={img.image_url}
              alt={img.caption || ''}
              caption={img.caption}
              rotate={ROTATIONS[index % ROTATIONS.length]}
              lift={LIFTS[index % LIFTS.length]}
              tape={TAPES[index % TAPES.length]}
              tapeRotate={TAPE_ROTATIONS[index % TAPE_ROTATIONS.length]}
              hover
              lazy
              onClick={() => openLightbox(index)}
              ariaLabel={img.caption ? `Xem ảnh: ${img.caption}` : 'Xem ảnh phóng to'}
              style={{ '--delay': `${0.3 + Math.min(index, 8) * 0.1}s` }}
            />
          ))}
        </div>
      )}

      {lightboxIndex !== null && createPortal(
        <div
          ref={dialogRef}
          className="lightbox"
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh"
        >
          <button type="button" className="lightbox__close" onClick={closeLightbox} aria-label="Đóng">✕</button>
          {count > 1 && (
            <button
              type="button"
              className="lightbox__nav lightbox__nav--prev"
              onClick={(e) => { e.stopPropagation(); showPrevious() }}
              aria-label="Ảnh trước"
            >
              ‹
            </button>
          )}
          <figure className="lightbox__polaroid" onClick={(e) => e.stopPropagation()}>
            <span className="tape tape--center lightbox__tape" aria-hidden="true" />
            <img
              src={images[lightboxIndex].image_url}
              alt={images[lightboxIndex].caption || ''}
              className="lightbox__img"
            />
            {images[lightboxIndex].caption && (
              <figcaption className="lightbox__caption">{images[lightboxIndex].caption}</figcaption>
            )}
          </figure>
          {count > 1 && (
            <button
              type="button"
              className="lightbox__nav lightbox__nav--next"
              onClick={(e) => { e.stopPropagation(); showNext() }}
              aria-label="Ảnh sau"
            >
              ›
            </button>
          )}
          <p className="lightbox__counter">
            {lightboxIndex + 1} / {count}{count > 1 && ' · vuốt ngang để xem tiếp'}
          </p>
        </div>,
        document.body,
      )}
    </section>
  )
}

export default PhotoGallery
