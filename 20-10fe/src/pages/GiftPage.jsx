import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import HeroSection from '../components/HeroSection'
import PhotoGallery from '../components/PhotoGallery'
import LetterSection from '../components/LetterSection'
import GiftLocked from '../components/GiftLocked'
import PaperError from '../components/PaperError'
import TypingText from '../components/TypingText'
import Petals from '../components/paper/Petals'
import { CLASS_LABEL } from '../lib/event'
import '../styles/gift.css'

const ERROR_VIEWS = {
  notfound: { title: 'Không tìm thấy trang này', stamp: ['KHÔNG', 'TÌM', { big: 'THẤY' }] },
  network: { title: 'Không kết nối được', stamp: ['MẤT', 'KẾT', { big: 'NỐI' }] },
  error: { title: 'Có lỗi xảy ra', stamp: ['CÓ', 'LỖI', { big: 'RỒI' }] },
}

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
        className="btn-stamp btn-stamp--clay share-btn"
        onClick={handleShare}
        title="Chia sẻ trang quà"
        aria-label="Chia sẻ trang quà"
      >
        ✉ Chia sẻ
      </button>
      {toast && (
        <div className="share-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

function GiftHeader({ studentName }) {
  return (
    <header className="gift__header">
      <Link to="/" className="gift__back">← Tìm tên khác</Link>
      <div className="gift__brand">
        <img src="/logoclass.jpg" alt="Logo lớp" />
        <span>{CLASS_LABEL}</span>
      </div>
      <ShareButton studentName={studentName} />
    </header>
  )
}

function GiftFooter() {
  return (
    <footer className="gift__footer">
      <img src="/logoclass.jpg" alt="" />
      <span>{CLASS_LABEL}</span>
    </footer>
  )
}

// Khung xương lúc tải: giữ bố cục thật, chỉ đổi về màu be/kem
function GiftSkeleton({ withHero }) {
  return (
    <>
      {withHero && (
        <section className="hero" aria-hidden="true">
          <div className="hero__text">
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line skeleton--wide" style={{ marginTop: 18 }} />
          </div>
          <div className="hero__photo">
            <div className="skeleton skeleton--photo" />
          </div>
        </section>
      )}
      <p className="gift__loading">Đang mở quà…</p>
      <div className="gift-skeleton__lines" aria-hidden="true">
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--wide" />
      </div>
      <div className="gift-skeleton__grid" aria-hidden="true">
        <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
      </div>
    </>
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
  const [error, setError] = useState(null) // { kind, message }
  const [locked, setLocked] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
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
          setError({ kind: 'notfound', message: 'Không tìm thấy trang này. Có thể bạn đã nhập sai đường link?' })
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
          else if (err.status === 404) setError({ kind: 'notfound', message: 'Có thể đường link đã hết hiệu lực hoặc bạn gõ nhầm. Thử tìm lại tên ở trang chủ nhé.' })
          else if (!navigator.onLine || err.isNetworkError) setError({ kind: 'network', message: 'Không thể kết nối backend. Hãy kiểm tra mạng và chắc chắn server đang chạy.' })
          else setError({ kind: 'error', message: err.message || 'Có lỗi xảy ra, vui lòng thử lại sau.' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [accessCode, retryKey, location.state])

  // Admin đang khóa trang quà chờ ngày 20/10
  if (locked) return <GiftLocked />

  const studentName = student?.nickname || student?.full_name

  if (loading) {
    return (
      <div className="gift page-paper" role="status" aria-live="polite">
        <div className="gift__inner">
          <GiftHeader studentName={studentName} />
          {/* Có sẵn student từ router state → hero thật hiện ngay, chỉ skeleton phần thân */}
          {student && <HeroSection student={student} />}
          <GiftSkeleton withHero={!student} />
        </div>
      </div>
    )
  }

  if (error) {
    const view = ERROR_VIEWS[error.kind] || ERROR_VIEWS.error
    return (
      <PaperError
        title={view.title}
        stamp={view.stamp}
        message={error.message}
        onRetry={() => setRetryKey((key) => key + 1)}
      />
    )
  }

  return (
    <div className="gift page-paper">
      <Petals />
      <div className="gift__inner">
        <GiftHeader studentName={studentName} />
        <HeroSection student={student} />
        {aiGreeting && (
          <section className="ai-note" aria-live="polite">
            <span className="ai-note__clip" aria-hidden="true" />
            <span className="ai-note__label">✨ MỘT LỜI CHÚC DÀNH RIÊNG CHO BẠN</span>
            <p><TypingText text={aiGreeting} /></p>
          </section>
        )}
        <PhotoGallery images={gallery} />
        <LetterSection letters={letters} accessCode={accessCode} />
        <GiftFooter />
      </div>
    </div>
  )
}

export default GiftPage
