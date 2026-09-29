import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import HeroSection from '../components/HeroSection'
import PhotoGallery from '../components/PhotoGallery'
import LetterSection from '../components/LetterSection'
import GiftLocked from '../components/GiftLocked'
import KeepsakeCard from '../components/KeepsakeCard'
import PaperError from '../components/PaperError'
import ReplyBox from '../components/ReplyBox'
import TypingText from '../components/TypingText'
import Petals from '../components/paper/Petals'
import { CLASS_LABEL, CLASS_NAME } from '../lib/event'
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

function GiftFooter({ openRank }) {
  return (
    <footer className="gift__footer">
      <img src="/logoclass.jpg" alt="" />
      <span>{CLASS_LABEL}</span>
      {/* Mở quà từ trang chủ thì biết mình là bạn thứ mấy của lớp mở quà */}
      {openRank && <span className="gift__rank">· bạn thứ {openRank} mở quà 🌸</span>}
    </footer>
  )
}

// Cuối trang: vài dòng gửi lại cả lớp, và lối sang Hộp thư hồi âm
function ThanksSection({ accessCode, replies, onReplied }) {
  return (
    <section className="gift__section thanks" aria-labelledby="thanks-title">
      <h2 id="thanks-title" className="section-title">
        Gửi lại đôi dòng
        <span className="section-title__count">cho cả lớp {CLASS_NAME}</span>
      </h2>
      <div className="thanks__card letter-paper">
        <p className="thanks__intro">
          Đọc xong rồi thì để lại vài chữ cho cả lớp nhé: một lời cảm ơn, một kỷ niệm, hay chỉ một cái mặt cười 😊
        </p>
        <ReplyBox
          accessCode={accessCode}
          target="class"
          recipient={`cả lớp ${CLASS_NAME}`}
          replies={replies}
          onSent={onReplied}
          openLabel="✉ Viết cho cả lớp"
          moreLabel="✉ Viết thêm cho cả lớp"
        />
      </div>
      <p className="thanks__board">
        <Link to="/hoi-am" className="link-dashed">📬 Xem Hộp thư hồi âm của lớp</Link>
      </p>
    </section>
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

// Lượt mở chờ ghi chỉ có giá trị trong một đêm chờ quà: tab thử cũ được trình
// duyệt khôi phục vài ngày sau không được góp cánh hoa thay chủ trang
const PENDING_OPEN_TTL_MS = 12 * 60 * 60 * 1000

// Ghi xong thì xoá lượt mở chờ khỏi history.state (tải lại trang không ghi
// lại). Sửa thẳng history thay vì navigate: đổi location.state sẽ làm trang
// tải lại nội dung và nhấp nháy.
function forgetPendingOpen() {
  const current = window.history.state
  if (!current?.usr?.pendingOpen) return
  window.history.replaceState({ ...current, usr: { ...current.usr, pendingOpen: undefined } }, '')
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
  // Hồi âm chủ trang đã viết (thư, cả lớp, admin) — hiện lại "cậu đã hồi âm"
  const [replies, setReplies] = useState([])
  const [aiGreeting, setAiGreeting] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null) // { kind, message }
  // Đang khoá chờ 20/10: { unlockAt, serverNow } để màn khoá đếm ngược đúng giờ
  const [locked, setLocked] = useState(null)
  const [retryKey, setRetryKey] = useState(0)
  // Bạn gõ tên ở trang chủ lúc quà còn khoá rồi chờ ở màn khoá tới giờ hẹn:
  // lượt mở được ghi khi quà mở ra ở đây. { code, rank } — rank của đúng trang
  const [recordedRank, setRecordedRank] = useState(null)
  const recordedFor = useRef(new Set())
  const openRank = location.state?.openRank
    || (recordedRank?.code === accessCode ? recordedRank.rank : null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setLocked(null)
      setAiGreeting('')
      // Đồng bộ hero với student truyền qua router state; navigate sang access
      // code khác mà không có state thì xóa hero cũ để không hiện nhầm người
      setStudent(location.state?.student || null)

      try {
        const {
          student: studentData,
          gallery: galleryData,
          letters: lettersData,
          replies: repliesData,
        } = await giftRepository.getGiftContent(accessCode)

        if (cancelled) return

        if (!studentData) {
          setError({ kind: 'notfound', message: 'Không tìm thấy trang này. Có thể bạn đã nhập sai đường link?' })
          return
        }

        setStudent(studentData)
        setGallery(galleryData || [])
        setLetters(lettersData || [])
        setReplies(repliesData || [])
        const pendingOpen = location.state?.pendingOpen
        const fresh = pendingOpen && Date.now() - Number(pendingOpen.at) < PENDING_OPEN_TTL_MS
        if (fresh && studentData.member_type === 'class' && !recordedFor.current.has(accessCode)) {
          recordedFor.current.add(accessCode)
          forgetPendingOpen()
          giftRepository.recordOpen(accessCode, pendingOpen.via)
            .then((result) => {
              if (!cancelled && result?.counted) setRecordedRank({ code: accessCode, rank: result.rank })
            })
            .catch(() => {})
        }
        giftRepository.generateGreeting(
          studentData.full_name,
          // Hồ sơ "bạn bè" ngoài lớp nhận lời chúc kiểu thông thường
          studentData.member_type === 'friend' ? 'visitor' : 'student',
        )
          .then((result) => { if (!cancelled) setAiGreeting(result.greeting) })
          .catch(() => {})
      } catch (err) {
        if (!cancelled) {
          if (err.status === 423) {
            setLocked({ unlockAt: err.data?.unlockAt || null, serverNow: err.data?.serverNow || null })
          }
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

  const addReply = (reply) => setReplies((current) => [...current, reply])

  // Admin đang khóa trang quà chờ ngày 20/10; tới giờ hẹn thì tự tải lại
  if (locked) {
    return (
      <GiftLocked
        unlockAt={locked.unlockAt}
        serverNow={locked.serverNow}
        onUnlock={() => setRetryKey((key) => key + 1)}
      />
    )
  }

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
        {/* Lời chúc admin viết riêng: người thật viết nên hiện luôn, không gõ
            từng chữ như câu máy sinh; không viết thì không có ô nào cả */}
        {student?.admin_wish && (
          <section className="ai-note ai-note--admin">
            <span className="ai-note__clip" aria-hidden="true" />
            <span className="ai-note__label">
              <span className="ai-note__label-long">💌 LỜI CHÚC TỪ ADMIN</span>
              <span className="ai-note__label-short">💌 TỪ ADMIN</span>
            </span>
            <p>{student.admin_wish}</p>
            <ReplyBox
              accessCode={accessCode}
              target="admin"
              recipient="admin"
              replies={replies.filter((reply) => reply.target === 'admin')}
              onSent={addReply}
              openLabel="✉ Hồi âm admin"
              className="ai-note__reply"
            />
          </section>
        )}
        {aiGreeting && (
          <section className="ai-note" aria-live="polite">
            <span className="ai-note__clip" aria-hidden="true" />
            <span className="ai-note__label">
              <span className="ai-note__label-long">✨ MỘT LỜI CHÚC DÀNH RIÊNG CHO BẠN</span>
              <span className="ai-note__label-short">✨ LỜI CHÚC DÀNH RIÊNG</span>
            </span>
            <p><TypingText text={aiGreeting} /></p>
          </section>
        )}
        <PhotoGallery images={gallery} />
        <LetterSection letters={letters} accessCode={accessCode} replies={replies} onReplied={addReply} />
        <ThanksSection
          accessCode={accessCode}
          replies={replies.filter((reply) => reply.target === 'class')}
          onReplied={addReply}
        />
        <KeepsakeCard accessCode={accessCode} studentName={studentName} greeting={aiGreeting} />
        <GiftFooter openRank={openRank} />
      </div>
    </div>
  )
}

export default GiftPage
