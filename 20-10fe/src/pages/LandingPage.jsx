import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import GiftReveal from '../components/GiftReveal'
import Petals from '../components/paper/Petals'
import Envelope from '../components/paper/Envelope'
import Stamp from '../components/paper/Stamp'
import Postmark from '../components/paper/Postmark'
import Polaroid from '../components/paper/Polaroid'
import useDialogA11y from '../hooks/useDialogA11y'
import useFaceScan from '../hooks/useFaceScan'
import { EVENT_YEAR, formatStamp } from '../lib/event'
import { greetingFor } from '../lib/faceVote'
import { seatLabel } from '../lib/seat'
import '../styles/landing.css'

// Face-service có thể còn đang nạp model khi trang vừa mở (start-dev mở trình
// duyệt sau 4 giây): hỏi lại status sau 5 giây rồi 15 giây trước khi thôi
const FACE_STATUS_RETRIES_MS = [5000, 10000]

// Camera chỉ chạy trên HTTPS (hoặc localhost) và trình duyệt có getUserMedia
function cameraSupported() {
  return typeof window !== 'undefined'
    && window.isSecureContext
    && Boolean(navigator.mediaDevices?.getUserMedia)
}

const EMPTY_WISH = {
  isAnonymous: false,
  senderName: '',
  receiverName: '',
  receiverType: 'class',
  title: '',
  content: '',
  revealAt: '',
}
const MATCH_ROTATIONS = [-1, 0.8, -0.5]

function computeRevealLimits() {
  const now = Date.now()
  return {
    min: new Date(now + 5 * 60 * 1000).toISOString().slice(0, 16),
    max: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  }
}

// "20/10 · 00:00" từ giá trị datetime-local — hiện trên chip hẹn giờ
function formatReveal(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function matchSubline(match) {
  const parts = []
  if (match.nickname && match.nickname !== match.displayName) parts.push(`"${match.nickname}"`)
  const seat = seatLabel(match.seatRow, match.seatCol)
  if (seat) parts.push(seat)
  return parts.join(' · ')
}

// Danh sách trùng tên: card trắng nghiêng xen kẽ, avatar kiểu tem
function MatchList({ matches, onPick, disabled = false }) {
  return (
    <div className="match-list" aria-live="polite">
      {matches.map((match, index) => {
        const subline = matchSubline(match)
        return (
          <button
            type="button"
            key={match.giftPath}
            className="match-card"
            style={{ '--rot': `${MATCH_ROTATIONS[index % MATCH_ROTATIONS.length]}deg`, '--delay': `${index * 0.1}s` }}
            disabled={disabled}
            onClick={() => onPick(match)}
          >
            <span className="match-card__avatar" aria-hidden="true">
              {match.avatarUrl ? <img src={match.avatarUrl} alt="" /> : match.displayName.charAt(0)}
            </span>
            <span className="match-card__text">
              <b>{match.displayName}</b>
              {subline && <small>{subline}</small>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LandingPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Hỏi "là ai" TRƯỚC khi nhập tên: khách trùng tên với thành viên lớp sẽ
  // không bao giờ bị tra danh sách rồi mở nhầm trang cá nhân của bạn ấy
  const [visitorRole, setVisitorRole] = useState(null) // 'classmate' | 'guest' | null
  const [name, setName] = useState('')
  const [matches, setMatches] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Gift reveal state
  const [revealPath, setRevealPath] = useState(null)
  const [revealName, setRevealName] = useState('')
  const [revealStudent, setRevealStudent] = useState(null)
  // 'face' khi quà được mở bằng Face ID → GiftReveal thêm huy hiệu nhỏ
  const [revealVia, setRevealVia] = useState('')

  // Face ID: thẻ ✨ chỉ hiện khi admin bật, service sống, đã có hồ sơ và máy
  // có camera trên kết nối an toàn. Thiếu một điều kiện → thẻ không hề xuất hiện.
  const [faceAvailable, setFaceAvailable] = useState(false)
  // Destructure ngay tại đây: videoRef là ref, phần còn lại là giá trị render —
  // gộp chung một object thì React Compiler coi mọi lần đọc thuộc tính là đọc ref
  const {
    active: faceActive,
    status: faceStatus,
    hint: faceHint,
    kind: faceKind,
    message: faceMessage,
    candidate: faceCandidate,
    secondsLeft: faceSecondsLeft,
    canRetry: faceCanRetry,
    videoRef: faceVideoRef,
    open: openFaceScan,
    close: closeFace,
    accept: acceptFace,
    deny: denyFace,
    retry: retryFace,
  } = useFaceScan()

  // Link "gửi lời chúc" từ màn khóa 20/10 mở thẳng modal (/?wish=1)
  const [wishOpen, setWishOpen] = useState(() => searchParams.get('wish') === '1')
  const [wishForm, setWishForm] = useState(EMPTY_WISH)
  const [wishImage, setWishImage] = useState(null)
  const [wishImagePreview, setWishImagePreview] = useState('')
  const [wishMatches, setWishMatches] = useState([])
  const [wishMessage, setWishMessage] = useState('')
  const [wishError, setWishError] = useState('')
  const [wishSubmitting, setWishSubmitting] = useState(false)
  // Màn "Thư đã vào hộp!" thay nội dung modal sau khi gửi thành công
  const [wishSent, setWishSent] = useState(null)
  const [showReveal, setShowReveal] = useState(false)
  const [revealLimits, setRevealLimits] = useState(computeRevealLimits)
  const wishFileRef = useRef(null)

  const closeWish = () => {
    setWishOpen(false)
    if (searchParams.has('wish')) setSearchParams({}, { replace: true })
  }
  const wishDialogRef = useDialogA11y(wishOpen, closeWish)
  // Esc / bấm nền / nút × đều đi qua đây → hook nhả camera ngay
  const faceDialogRef = useDialogA11y(faceActive, closeFace)

  // Chỉ hỏi status khi đang ở bước "thành viên trong lớp"; lỗi gì cũng coi như
  // tắt. setState chỉ chạy trong callback bất đồng bộ (quy tắc react-hooks v7).
  useEffect(() => {
    if (visitorRole !== 'classmate' || !cameraSupported()) return undefined
    let cancelled = false
    const timers = []
    const probe = async (attempt) => {
      try {
        const status = await giftRepository.faceStatus()
        if (cancelled) return
        if (status?.enabled) {
          setFaceAvailable(true)
          return
        }
      } catch {
        // Thẻ tiếp tục ẩn — gõ tên vẫn là đường chính
      }
      if (cancelled) return
      const delay = FACE_STATUS_RETRIES_MS[attempt]
      if (delay !== undefined) timers.push(setTimeout(() => probe(attempt + 1), delay))
    }
    probe(0)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [visitorRole])

  const clearWishImage = () => {
    setWishImage(null)
    setWishImagePreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return ''
    })
    if (wishFileRef.current) wishFileRef.current.value = ''
  }

  const chooseWishImage = (file) => {
    if (!file) { clearWishImage(); return }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setWishError('Ảnh phải là JPG, PNG, GIF hoặc WebP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setWishError('Ảnh tối đa 5 MB.')
      return
    }
    setWishError('')
    setWishImage(file)
    setWishImagePreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
  }

  const resetWish = () => {
    setWishForm(EMPTY_WISH)
    clearWishImage()
    setWishMatches([])
    setWishMessage('')
    setWishError('')
    setWishSent(null)
    setShowReveal(false)
  }

  const openWish = () => {
    setRevealLimits(computeRevealLimits())
    resetWish()
    setWishOpen(true)
  }

  const accessCodeFromGiftPath = (giftPath) => giftPath.split('/').filter(Boolean).pop()

  const openGiftWithReveal = async (giftPath, displayName = '', via = '') => {
    const accessCode = accessCodeFromGiftPath(giftPath)
    let studentData = null

    try {
      studentData = accessCode ? await giftRepository.getGift(accessCode) : null
    } catch (err) {
      if (err?.status === 423) {
        // Trang quà đang khóa chờ 20/10 — bỏ hiệu ứng mở quà, đưa thẳng tới
        // màn "Chưa đến ngày" của GiftPage
        navigate(giftPath)
        return
      }
      // Vẫn mở quà nếu không tải được thông tin chỗ ngồi.
    }

    setRevealName(displayName || studentData?.nickname || studentData?.full_name || '')
    setRevealVia(via)
    // Truyền student sang GiftReveal (sơ đồ lớp + thư bay từ đúng bàn) và sang
    // GiftPage qua router state để hero hiện ngay, không fetch lại
    setRevealStudent(studentData)
    setRevealPath(giftPath)
  }

  const openFace = () => {
    setError('')
    openFaceScan()
  }

  // "Đúng là mình": hook đã đóng modal và nhả camera; chạy hiệu ứng mở quà như
  // khi gõ tên (sơ đồ lớp, thư bay từ bàn), khóa 20/10 vẫn được tôn trọng
  const confirmFace = async () => {
    const candidate = acceptFace()
    if (candidate) await openGiftWithReveal(candidate.giftPath, candidate.displayName, 'face')
  }

  // Dừng quét → đóng modal và đưa con trỏ về ô gõ tên. Chờ một nhịp vì
  // useDialogA11y trả focus về nút ✨ ngay khi modal đóng.
  const typeNameInstead = () => {
    closeFace()
    setTimeout(() => document.getElementById('student-name')?.focus(), 0)
  }

  const wishLetterData = () => ({
    sender_name: wishForm.isAnonymous ? null : wishForm.senderName.trim(),
    title: wishForm.title.trim() || null,
    content: wishForm.content.trim(),
    is_anonymous: wishForm.isAnonymous,
    reveal_at: wishForm.revealAt || null,
  })

  const finishWish = ({ friend = false } = {}) => {
    setWishMatches([])
    setWishMessage('')
    setWishSent({ revealAt: wishForm.revealAt || null, friend })
    setWishForm(EMPTY_WISH)
    clearWishImage()
    setShowReveal(false)
  }

  const sendWishToGiftPath = async (giftPath) => {
    const accessCode = accessCodeFromGiftPath(giftPath)
    if (!accessCode) throw new Error('Không xác định được người nhận.')
    await giftRepository.createLetter(accessCode, wishLetterData(), wishImage)
    finishWish()
  }

  const submitWish = async (event) => {
    event.preventDefault()
    setWishError('')
    setWishMessage('')
    setWishMatches([])
    const receiverName = wishForm.receiverName.trim()
    const content = wishForm.content.trim()
    const senderName = wishForm.senderName.trim()
    if (!wishForm.isAnonymous && !senderName) {
      setWishError('Vui lòng nhập tên người gửi hoặc chọn ẩn danh.')
      return
    }
    if (receiverName.length < 2) {
      setWishError('Tên người nhận phải có ít nhất 2 ký tự.')
      return
    }
    if (!content) {
      setWishError('Vui lòng nhập lời chúc.')
      return
    }
    setWishSubmitting(true)
    try {
      // Người nhận NGOÀI lớp: không tra danh sách — backend tự tạo hồ sơ
      // "bạn bè" và lưu lời chúc cho họ
      if (wishForm.receiverType === 'friend') {
        await giftRepository.createFriendLetter(
          { ...wishLetterData(), receiver_name: receiverName },
          wishImage,
        )
        finishWish({ friend: true })
        return
      }

      const result = await giftRepository.resolveStudent(receiverName)
      if (result?.giftPath) await sendWishToGiftPath(result.giftPath)
      else if (result?.matches?.length) {
        setWishMatches(result.matches)
        setWishMessage('Có nhiều bạn trùng tên. Hãy chọn đúng người nhận lời chúc.')
      } else {
        // Response không có giftPath lẫn matches (mock trả null, backend đổi shape)
        setWishError('Không tìm thấy người nhận trong danh sách. Nếu người nhận không thuộc lớp, hãy chọn "Ngoài lớp".')
      }
    } catch (err) {
      if (err.status === 404) setWishError('Không tìm thấy người nhận trong danh sách. Nếu người nhận không thuộc lớp, hãy chọn "Ngoài lớp".')
      else setWishError(err.message || 'Không gửi được lời chúc.')
    } finally {
      setWishSubmitting(false)
    }
  }

  const pickWishMatch = async (match) => {
    setWishSubmitting(true)
    setWishError('')
    try { await sendWishToGiftPath(match.giftPath) }
    catch (err) { setWishError(err.message || 'Không gửi được lời chúc.') }
    finally { setWishSubmitting(false) }
  }

  const chooseRole = (role) => {
    // Camera không bao giờ sống lâu hơn bước "thành viên trong lớp"
    closeFace()
    setVisitorRole(role)
    setError('')
    setMatches([])
    setMessage('')
  }

  const submit = async (event) => {
    event.preventDefault()
    const value = name.trim()
    setError(''); setMatches([]); setMessage('')
    if (value.length < 2) { setError('Vui lòng nhập ít nhất 2 ký tự.'); return }

    // Khách KHÔNG tra danh sách lớp — chỉ tra các hồ sơ "bạn bè" (người ngoài
    // lớp từng được ai đó gửi lời chúc); không có thì sang trang chúc chung
    if (visitorRole === 'guest') {
      setLoading(true)
      try {
        const result = await giftRepository.resolveStudent(value, 'friend')
        if (result?.giftPath) {
          await openGiftWithReveal(result.giftPath, value)
          return
        }
        if (result?.matches?.length) {
          setMatches(result.matches)
          setMessage(result.message || '')
          return
        }
        navigate(`/celebrate/${encodeURIComponent(value)}?audience=visitor`)
      } catch (err) {
        if (err.status === 404) navigate(`/celebrate/${encodeURIComponent(value)}?audience=visitor`)
        else if (!navigator.onLine || err.isNetworkError) setError('Bạn đang offline hoặc backend chưa được bật.')
        else setError(err.message)
      } finally { setLoading(false) }
      return
    }

    setLoading(true)
    try {
      const result = await giftRepository.resolveStudent(value)
      if (result?.giftPath) await openGiftWithReveal(result.giftPath, value)
      else if (result?.matches?.length) { setMatches(result.matches); setMessage(result.message || '') }
      else setError('Không tìm thấy tên này trong danh sách.')
    } catch (err) {
      // Thành viên lớp nhưng không có trang quà riêng (ví dụ các bạn nam)
      if (err.status === 404) navigate(`/celebrate/${encodeURIComponent(value)}?audience=classmate`)
      else if (!navigator.onLine || err.isNetworkError) setError('Bạn đang offline hoặc backend chưa được bật.')
      else setError(err.message)
    } finally { setLoading(false) }
  }

  const isGuest = visitorRole === 'guest'
  const sentAt = new Date()

  return (
    <main className="landing page-paper">
      <Petals count={3} />
      {/* Overlay mở quà phủ lên trang chủ (mờ đi phía sau): sơ đồ lớp → thư bay
          từ bàn → phong bì mở → chuyển sang trang quà */}
      {revealPath && (
        <GiftReveal
          student={revealStudent}
          recipientName={revealName}
          via={revealVia}
          onComplete={() => navigate(revealPath, revealStudent ? { state: { student: revealStudent } } : undefined)}
        />
      )}
      <div className="landing__grid">
        <div className="landing__envelope">
          <Envelope open={Boolean(visitorRole)} sealWiggle />
        </div>
        <div className="landing__content">
          {!visitorRole ? (
            <>
              <p className="kicker">20 · 10 · {EVENT_YEAR}</p>
              <h1 className="landing__title">Một món quà nhỏ dành riêng cho bạn</h1>
              <p className="landing__intro">Nhập tên để mở không gian lưu bút và những lời chúc từ lớp mình.</p>
              <p className="landing__ask">Trước tiên, cho tụi mình biết bạn là ai nhé:</p>
              <div className="landing__roles">
                <button type="button" className="btn-stamp" style={{ '--rot': '-1deg' }} onClick={() => chooseRole('classmate')}>
                  <span className="btn-stamp__icon" aria-hidden="true">✎</span>Mình là thành viên trong lớp
                </button>
                <button type="button" className="btn-stamp btn-stamp--moss" style={{ '--rot': '1deg' }} onClick={() => chooseRole('guest')}>
                  <span className="btn-stamp__icon" aria-hidden="true">✿</span>Mình là khách ghé thăm
                </button>
              </div>
            </>
          ) : matches.length > 0 ? (
            <>
              <button type="button" className="btn-dashed" onClick={() => { setMatches([]); setMessage('') }}>← Chọn lại</button>
              <h1 className="landing__title landing__title--step">Có mấy bạn tên <span className="landing__name">{name.trim()}</span></h1>
              <p className="landing__intro">{message || 'Bạn là ai trong số này? Chọn đúng người để mở quà.'}</p>
              <MatchList matches={matches} onPick={(match) => openGiftWithReveal(match.giftPath, match.displayName)} />
              <p className="landing__note">
                Không thấy tên mình? <button type="button" className="landing__link" onClick={() => setMatches([])}>Nhập lại tên đầy đủ</button>
              </p>
            </>
          ) : (
            <>
              <button type="button" className="btn-dashed" onClick={() => chooseRole(null)}>
                ← Chọn lại · {isGuest ? 'khách ghé thăm' : 'thành viên trong lớp'}
              </button>
              <h1 className="landing__title landing__title--step">Tên của bạn là gì?</h1>
              <p id="student-name-help" className="landing__intro">
                {isGuest
                  ? 'Nhập tên của bạn để nhận một lời chúc 20/10 dành riêng cho bạn.'
                  : 'Nhập họ tên hoặc tên thường gọi của bạn trong lớp.'}
              </p>
              <form className="landing__form" onSubmit={submit}>
                <label className="field-hand" htmlFor="student-name">
                  Tên:
                  <input
                    id="student-name"
                    className="input-hand"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isGuest ? 'Ví dụ: Minh Thư' : 'Ví dụ: Nguyễn Thúy Vy'}
                    autoComplete="name"
                    aria-describedby="student-name-help"
                  />
                </label>
                <button className="btn-primary" disabled={loading} aria-busy={loading}>
                  {loading ? 'Đang tìm…' : isGuest ? 'Nhận lời chúc' : 'Mở quà'}
                </button>
              </form>
              {/* Lối vào phụ, không thay thế gõ tên: service báo nghỉ giữa chừng
                  thì thẻ tự ẩn luôn cho tới lần tải trang sau */}
              {!isGuest && faceAvailable && faceKind !== 'offline' && (
                <button type="button" className="face-card" onClick={openFace} disabled={loading}>
                  <span className="face-card__icon" aria-hidden="true">✨</span>
                  <span className="face-card__text">
                    <b>Face ID</b>
                    <small>Nếu cậu đang ở nơi có ánh sáng ổn định, hãy đến với tôi.</small>
                  </span>
                </button>
              )}
              {error && <p className="alert-note landing__alert" role="alert">{error}</p>}
              <p className="landing__note">
                {isGuest
                  ? 'Là thành viên trong lớp? Chọn lại "thành viên trong lớp" để mở đúng trang quà của bạn.'
                  : 'Khách trùng tên với bạn trong lớp? Chọn lại "khách ghé thăm" để không mở nhầm trang.'}
              </p>
            </>
          )}
          <button type="button" className="landing__wish" onClick={openWish}>
            <span className="link-dashed">✉ Mình muốn gửi lời chúc cho một bạn</span>
          </button>
        </div>
      </div>

      {wishOpen && (
        <div className="wish-backdrop" role="presentation" onClick={closeWish}>
          <section
            ref={wishDialogRef}
            className={wishSent ? 'wish-modal wish-modal--success' : 'wish-modal letter-paper letter-paper--form'}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wish-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="wish-close" onClick={closeWish} aria-label="Đóng">×</button>
            {wishSent ? (
              <div className="wish-success">
                <div className="wish-success__envelope">
                  <Envelope logo={false} sealAnimate sealDelay={0.3}>
                    <Stamp variant="date" size="sm" rotate={6} animate delay={0.6} className="wish-success__stamp" />
                    <Postmark
                      moss
                      size={84}
                      rotate={-14}
                      animate
                      delay={0.9}
                      lines={['ĐÃ', { big: 'GỬI' }, formatStamp(sentAt, { time: false }).slice(0, 5)]}
                      className="wish-success__postmark"
                    />
                  </Envelope>
                </div>
                <h2 id="wish-modal-title">Thư đã vào hộp!</h2>
                <p role="status">
                  {wishSent.revealAt
                    ? <>Lời chúc bí mật sẽ hiện đúng lúc <b>{formatReveal(wishSent.revealAt).split(' · ').reverse().join(' · ')}</b>, sau khi admin duyệt.</>
                    : 'Lời chúc sẽ xuất hiện trên trang quà sau khi admin duyệt.'}
                  {wishSent.friend && ' Người nhận tìm tên mình ở trang chủ (mục "khách ghé thăm") là thấy.'}
                </p>
                <div className="wish-success__actions">
                  <button type="button" className="btn-primary" onClick={resetWish}>Gửi thêm một lời chúc</button>
                  <button type="button" className="landing__wish" onClick={closeWish}><span className="link-dashed">Về trang chủ</span></button>
                </div>
              </div>
            ) : (
              <>
                <Stamp variant="date" rotate={5} className="wish-stamp" />
                <h2 id="wish-modal-title">Gửi lời chúc</h2>
                <form className="wish-form" onSubmit={submitWish}>
                  <div className="wish-row">
                    <span className="wish-row__label">Mình là</span>
                    {wishForm.isAnonymous
                      ? <span className="wish-row__anon">một người bạn ẩn danh</span>
                      : (
                        <input
                          className="input-hand wish-row__input"
                          value={wishForm.senderName}
                          maxLength={100}
                          onChange={(event) => setWishForm({ ...wishForm, senderName: event.target.value })}
                          placeholder="Ví dụ: Nguyễn Văn A"
                          aria-label="Tên của bạn"
                        />
                      )}
                    <label className="wish-check">
                      <input
                        type="checkbox"
                        checked={wishForm.isAnonymous}
                        onChange={(event) => setWishForm({ ...wishForm, isAnonymous: event.target.checked, senderName: event.target.checked ? '' : wishForm.senderName })}
                      />
                      Ẩn danh
                    </label>
                  </div>
                  <div className="wish-row">
                    <span className="wish-row__label">Gửi tới</span>
                    <input
                      className="input-hand wish-row__input"
                      value={wishForm.receiverName}
                      maxLength={100}
                      onChange={(event) => setWishForm({ ...wishForm, receiverName: event.target.value })}
                      placeholder={wishForm.receiverType === 'friend' ? 'Ví dụ: Minh Thư (bạn khác lớp)' : 'Ví dụ: Phương Anh'}
                      aria-label="Tên người nhận"
                    />
                    <span className="wish-toggle" role="radiogroup" aria-label="Người nhận là">
                      <button type="button" role="radio" aria-checked={wishForm.receiverType === 'class'} onClick={() => setWishForm({ ...wishForm, receiverType: 'class' })}>Trong lớp</button>
                      <button type="button" role="radio" aria-checked={wishForm.receiverType === 'friend'} onClick={() => setWishForm({ ...wishForm, receiverType: 'friend' })}>Ngoài lớp</button>
                    </span>
                  </div>
                  {wishForm.receiverType === 'friend' && (
                    <p className="wish-hint">Hệ thống sẽ tạo trang lời chúc riêng cho người này — họ tìm tên mình ở trang chủ (mục "khách ghé thăm") là thấy.</p>
                  )}
                  <div className="wish-row">
                    <span className="wish-row__label">Tiêu đề</span>
                    <input
                      className="input-hand wish-row__input"
                      value={wishForm.title}
                      maxLength={200}
                      onChange={(event) => setWishForm({ ...wishForm, title: event.target.value })}
                      placeholder="Ví dụ: Gửi người bạn đặc biệt..."
                      aria-label="Tiêu đề"
                    />
                    <i className="wish-row__note">tuỳ chọn</i>
                  </div>
                  <textarea
                    className="input-hand wish-textarea"
                    value={wishForm.content}
                    maxLength={5000}
                    rows={4}
                    onChange={(event) => setWishForm({ ...wishForm, content: event.target.value })}
                    placeholder="Bạn hãy viết lời chúc của bạn vào đây..."
                    aria-label="Lời chúc"
                  />
                  <div className="wish-chips">
                    <button
                      type="button"
                      className={`btn-dashed${wishForm.revealAt ? ' is-active' : ''}`}
                      aria-expanded={showReveal}
                      onClick={() => setShowReveal((open) => !open)}
                    >
                      ⏰ {wishForm.revealAt ? formatReveal(wishForm.revealAt) : <>Hẹn giờ hiện lời chúc <i>tuỳ chọn</i></>}
                    </button>
                    <button type="button" className={`btn-dashed${wishImage ? ' is-active' : ''}`} onClick={() => wishFileRef.current?.click()}>
                      📷 {wishImage ? 'Đổi ảnh' : <>Kèm ảnh <i>≤ 5 MB</i></>}
                    </button>
                    <input
                      ref={wishFileRef}
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={(e) => chooseWishImage(e.target.files?.[0] || null)}
                    />
                  </div>
                  {showReveal && (
                    <label className="wish-reveal">
                      Hiện lúc
                      <input
                        type="datetime-local"
                        value={wishForm.revealAt}
                        min={revealLimits.min}
                        max={revealLimits.max}
                        onChange={(e) => setWishForm({ ...wishForm, revealAt: e.target.value })}
                      />
                      {wishForm.revealAt && (
                        <button type="button" className="btn-dashed" onClick={() => setWishForm({ ...wishForm, revealAt: '' })}>Bỏ hẹn giờ</button>
                      )}
                    </label>
                  )}
                  {wishImagePreview && (
                    <div className="wish-image-preview">
                      <Polaroid src={wishImagePreview} alt="Ảnh sẽ gửi kèm" small rotate={-3} tape="none" />
                      <button type="button" className="btn-dashed" onClick={clearWishImage}>Bỏ ảnh</button>
                    </div>
                  )}
                  {wishError && <p className="alert-note wish-alert" role="alert">{wishError}</p>}
                  {wishMatches.length > 0 && (
                    <div className="wish-matches">
                      <p className="wish-matches__intro">{wishMessage}</p>
                      <MatchList matches={wishMatches} onPick={pickWishMatch} disabled={wishSubmitting} />
                    </div>
                  )}
                  <div className="wish-submit-row">
                    <span className="wish-submit-note">Lời chúc sẽ hiện sau khi admin duyệt</span>
                    <button className="btn-stamp btn-stamp--fill wish-submit" disabled={wishSubmitting}>
                      {wishSubmitting ? 'Đang gửi…' : 'Dán tem & gửi ✉'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      )}

      {/* Face ID: con trực tiếp của <main> như modal lời chúc — .landing__content
          có animation transform nên sẽ thành khung chứa của position: fixed */}
      {faceActive && (
        <div className="wish-backdrop" role="presentation" onClick={closeFace}>
          <section
            ref={faceDialogRef}
            className="wish-modal face-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="face-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="wish-close" onClick={closeFace} aria-label="Đóng">×</button>
            {faceStatus === 'confirm' && faceCandidate ? (
              <div className="face-confirm">
                <Postmark
                  moss
                  size={84}
                  rotate={-12}
                  animate
                  lines={['MẮT', 'THẦN', { big: '20.10' }]}
                  className="face-confirm__postmark"
                />
                <p className="face-confirm__greeting">{greetingFor(faceCandidate.score)}</p>
                <h2 id="face-modal-title">Có phải cậu là <b>{faceCandidate.displayName}</b>? 🌸</h2>
                <div className="face-actions">
                  <button type="button" className="btn-primary" onClick={confirmFace}>Đúng là mình 🌸</button>
                  <button type="button" className="landing__wish" onClick={denyFace}>
                    <span className="link-dashed">Không phải mình</span>
                  </button>
                </div>
              </div>
            ) : faceStatus === 'stopped' ? (
              <div className="face-stopped">
                <h2 id="face-modal-title">✨ Face ID</h2>
                <p className="alert-note" role="alert">{faceMessage}</p>
                <div className="face-actions">
                  {faceCanRetry && <button type="button" className="btn-primary" onClick={retryFace}>Quét lại</button>}
                  <button type="button" className="landing__wish" onClick={typeNameInstead}>
                    <span className="link-dashed">Gõ tên thay nhé</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 id="face-modal-title">✨ Face ID</h2>
                <div className={`face-viewfinder${faceStatus === 'scanning' ? ' is-scanning' : ''}`}>
                  <video ref={faceVideoRef} className="face-video" autoPlay muted playsInline aria-hidden="true" />
                  <span className="face-oval" aria-hidden="true" />
                </div>
                {/* Chữ luôn hiện song song với vòng quét: prefers-reduced-motion
                    tắt animation thì người dùng vẫn biết máy đang làm gì */}
                <p className="face-hint" role="status" aria-live="polite">{faceHint}</p>
                {faceStatus === 'scanning' && (
                  <p className="face-countdown">còn {faceSecondsLeft} giây</p>
                )}
                <p className="wish-hint face-privacy">
                  Video không được ghi lại — từng khung hình chỉ dùng để so khớp ngay lúc đó rồi bỏ.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default LandingPage
