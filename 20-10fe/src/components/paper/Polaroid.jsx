import { useEffect, useRef, useState } from 'react'
import { cld, CLD_AVATAR, CLD_THUMB } from '../../lib/cloudinary'

const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined'

/**
 * Ảnh polaroid dán băng keo. `onClick` biến khung ảnh thành nút (lightbox);
 * `lazy` chỉ tải ảnh khi cuộn tới; không có `src` hoặc ảnh lỗi thì hiện
 * khung sọc be với `fallback` (chữ cái đầu, dấu "?"...).
 */
function Polaroid({
  src,
  alt = '',
  caption,
  fallback = '?',
  rotate = 0,
  lift = 0,
  tape = 'center',
  tapeRotate,
  square = false,
  small = false,
  sway = false,
  hover = false,
  lazy = false,
  onClick,
  ariaLabel,
  className = '',
  style,
  children,
}) {
  const frameRef = useRef(null)
  const [inView, setInView] = useState(!lazy || !hasIntersectionObserver)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!lazy || !hasIntersectionObserver) return undefined
    const element = frameRef.current
    if (!element) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [lazy])

  const classes = [
    'polaroid',
    square && 'polaroid--square',
    small && 'polaroid--sm',
    sway && 'polaroid--sway',
    hover && 'polaroid--hover',
    className,
  ].filter(Boolean).join(' ')

  const css = { ...style, '--rot': `${rotate}deg`, '--lift': `${lift}px` }
  if (tapeRotate !== undefined) css['--tape-rot'] = `${tapeRotate}deg`

  const showImage = Boolean(src) && inView && !failed
  // Ảnh Cloudinary được lưu nguyên bản (tới 5 MB); polaroid chỉ cần bản 600px.
  // Ảnh vuông (avatar) cắt vuông và ưu tiên giữ khuôn mặt ở giữa khung.
  const displaySrc = cld(src, square ? CLD_AVATAR : CLD_THUMB)
  const frame = (
    <>
      {showImage && (
        <img
          src={displaySrc}
          alt={alt}
          loading={lazy ? 'lazy' : undefined}
          className={`polaroid__img${loaded ? ' is-loaded' : ''}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {(!src || failed) && (
        <span className="polaroid__fallback" role="img" aria-label={failed ? 'Ảnh không thể tải' : alt || 'Chưa có ảnh'}>
          {fallback}
        </span>
      )}
    </>
  )

  return (
    <figure className={classes} style={css}>
      {tape !== 'none' && <span className={`tape tape--${tape}`} aria-hidden="true" />}
      {onClick ? (
        <button type="button" ref={frameRef} className="polaroid__frame" onClick={onClick} aria-label={ariaLabel || alt || 'Xem ảnh phóng to'}>
          {frame}
        </button>
      ) : (
        <div ref={frameRef} className="polaroid__frame">{frame}</div>
      )}
      {caption && <figcaption className="polaroid__caption">{caption}</figcaption>}
      {children}
    </figure>
  )
}

export default Polaroid
