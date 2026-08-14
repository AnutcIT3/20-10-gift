import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import HeroSection from '../components/HeroSection'
import PhotoGallery from '../components/PhotoGallery'
import LetterSection from '../components/LetterSection'
import '../styles/gift.css'

// ── Share Button ──────────────────────────────────────────────────────────────
function ShareButton({ studentName }) {
  const [toast, setToast] = useState('')

  const handleShare = useCallback(async () => {
    const url = window.location.href
    const title = `Quà 20/10 dành cho ${studentName || 'bạn'} 🌷`
    const text = 'Mở trang quà đặc biệt nhân ngày Phụ nữ Việt Nam 20/10!'

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
        return
      } catch {
        // User cancelled — silently ignore
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url)
      setToast('Đã copy link!')
    } catch {
      setToast('Không copy được link')
    }
  }, [studentName])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="share-wrap">
      <button
        id="share-gift-btn"
        type="button"
        className="share-btn"
        onClick={handleShare}
        title="Chia sẻ trang quà"
        aria-label="Chia sẻ trang quà"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        <span>Chia sẻ</span>
      </button>
      {toast && (
        <div className="share-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── GiftPage ──────────────────────────────────────────────────────────────────
function GiftPage() {
  const { accessCode } = useParams()
  const location = useLocation()
  // LandingPage đã fetch student cho hiệu ứng mở quà và truyền qua router
  // state — dùng ngay làm hero thay vì bắt người dùng nhìn skeleton toàn trang
  const [student, setStudent] = useState(() => location.state?.student || null)
  const [gallery, setGallery] = useState([])
  const [letters, setLetters] = useState([])
  const [aiGreeting, setAiGreeting] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [locked, setLocked] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')
      setLocked(false)
      setAiGreeting('')
      // Đồng bộ hero với student truyền qua router state; navigate sang access
      // code khác mà không có state thì xóa hero cũ để không hiện nhầm người
      setStudent(location.state?.student || null)

      try {
        const {
          student: studentData,
          gallery: galleryData,
          letters: lettersData,
        } = await giftRepository.getGiftContent(accessCode)

        if (cancelled) return

        if (!studentData) {
          setError('Không tìm thấy trang này. Có thể bạn đã nhập sai đường link?')
          return
        }

        setStudent(studentData)
        setGallery(galleryData || [])
        setLetters(lettersData || [])
        giftRepository.generateGreeting(
          studentData.full_name,
          // Hồ sơ "bạn bè" ngoài lớp nhận lời chúc kiểu thông thường
          studentData.member_type === 'friend' ? 'visitor' : 'student',
        )
          .then((result) => { if (!cancelled) setAiGreeting(result.greeting) })
          .catch(() => {})
      } catch (err) {
        if (!cancelled) {
          if (err.status === 423) setLocked(true)
          else if (err.status === 404) setError('Không tìm thấy trang này. Link có thể đã hết hiệu lực.')
          else if (!navigator.onLine || err.isNetworkError) setError('Không thể kết nối backend. Hãy kiểm tra mạng và chắc chắn server đang chạy.')
          else setError(err.message || 'Có lỗi xảy ra, vui lòng thử lại sau.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [accessCode, retryKey, location.state])

  // Admin đang khóa trang quà chờ ngày 20/10
  if (locked) {
    return (
      <div className="gift-locked">
        <div className="gift-locked-card">
          <span className="gift-locked-emoji" aria-hidden="true">🎁</span>
          <h1>Chưa đến ngày 20/10</h1>
          <p>
            Món quà của bạn đang được gói lại thật kỹ để chờ đúng ngày.
            Hãy quay lại vào dịp 20/10 nhé — hộp quà sẽ tự mở! 💝
          </p>
          <Link to="/" className="gift-error-back secondary">Về trang chủ</Link>
        </div>
      </div>
    )
  }

  if (loading) {
    // Có sẵn student từ router state → hero thật hiện ngay, chỉ skeleton phần thân
    if (student) {
      return (
        <div className="gift-page">
          <HeroSection student={student} />
          <div className="gift-body" role="status" aria-live="polite">
            <p className="gift-loading-text">Đang mở quà...</p>
            <section className="gift-skeleton-card">
              <div className="gift-skeleton-line" />
              <div className="gift-skeleton-line wide" />
            </section>
            <section className="gift-skeleton-grid">
              <div /><div /><div />
            </section>
          </div>
        </div>
      )
    }
    return (
      <div className="gift-page gift-skeleton-page" role="status" aria-live="polite">
        <section className="hero gift-skeleton-hero">
          <div className="hero-bg" />
          <div className="hero-content">
            <div className="gift-skeleton-avatar" />
            <div className="gift-skeleton-line title" />
            <div className="gift-skeleton-line intro" />
          </div>
        </section>
        <div className="gift-body">
          <p className="gift-loading-text">Đang mở quà...</p>
          <section className="gift-skeleton-card">
            <div className="gift-skeleton-line" />
            <div className="gift-skeleton-line wide" />
          </section>
          <section className="gift-skeleton-grid">
            <div /><div /><div />
          </section>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="gift-error">
        <p className="gift-error-message" role="alert">{error}</p>
        <div className="gift-error-actions">
          <button type="button" className="gift-error-back" onClick={() => setRetryKey((key) => key + 1)}>Thử lại</button>
          <Link to="/" className="gift-error-back secondary">Về trang chủ</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="gift-page">
      <HeroSection student={student} />
      <div className="gift-body">
        <div className="gift-top-actions">
          <Link to="/">← Tìm tên khác</Link>
          <ShareButton studentName={student?.nickname || student?.full_name} />
        </div>
        {aiGreeting && <section className="ai-greeting" aria-live="polite"><span>✨ Một lời chúc dành riêng cho bạn</span><p>{aiGreeting}</p></section>}
        <PhotoGallery images={gallery} />
        <LetterSection letters={letters} accessCode={accessCode} />
      </div>
    </div>
  )
}

export default GiftPage
