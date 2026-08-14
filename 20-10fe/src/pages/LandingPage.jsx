import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import SeatLetterReveal from '../components/SeatLetterReveal'
import GiftReveal from '../components/GiftReveal'
import useDialogA11y from '../hooks/useDialogA11y'
import '../styles/landing.css'

function LandingPage() {
  const navigate = useNavigate()
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

  const [wishOpen, setWishOpen] = useState(false)
  const [wishForm, setWishForm] = useState({
    isAnonymous: false,
    senderName: '',
    receiverName: '',
    title: '',
    content: '',
    revealAt: '',
  })
  const [wishMatches, setWishMatches] = useState([])
  const [wishMessage, setWishMessage] = useState('')
  const [wishError, setWishError] = useState('')
  const [wishSubmitting, setWishSubmitting] = useState(false)
  const [seatRevealStudent, setSeatRevealStudent] = useState(null)
  const [revealLimits, setRevealLimits] = useState({ min: '', max: '' })
  const wishDialogRef = useDialogA11y(wishOpen, () => setWishOpen(false))

  const resetWish = () => {
    setWishForm({ isAnonymous: false, senderName: '', receiverName: '', title: '', content: '', revealAt: '' })
    setWishMatches([])
    setWishMessage('')
    setWishError('')
  }

  const openWish = () => {
    const now = Date.now()
    setRevealLimits({
      min: new Date(now + 5 * 60 * 1000).toISOString().slice(0, 16),
      max: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    })
    resetWish()
    setWishOpen(true)
  }

  const accessCodeFromGiftPath = (giftPath) => giftPath.split('/').filter(Boolean).pop()

  const openGiftWithReveal = async (giftPath, displayName = '') => {
    const accessCode = accessCodeFromGiftPath(giftPath)
    let studentData = null

    try {
      studentData = accessCode ? await giftRepository.getGift(accessCode) : null
      if (studentData?.seat_row || studentData?.seat_col || studentData?.seat) {
        setSeatRevealStudent(studentData)
        await new Promise((resolve) => {
          setTimeout(resolve, 1700)
        })
      }
    } catch (err) {
      if (err?.status === 423) {
        // Trang quà đang khóa chờ 20/10 — bỏ hiệu ứng mở quà, đưa thẳng tới
        // màn "Chưa đến ngày" của GiftPage
        navigate(giftPath)
        return
      }
      // Vẫn mở quà nếu không tải được thông tin chỗ ngồi.
    } finally {
      setSeatRevealStudent(null)
    }

    setRevealName(displayName || studentData?.nickname || studentData?.full_name || '')
    // Truyền student sang GiftPage qua router state để hero hiện ngay,
    // không vứt đi dữ liệu vừa fetch rồi bắt người dùng chờ fetch lại
    setRevealStudent(studentData)
    setRevealPath(giftPath)
  }

  const sendWishToGiftPath = async (giftPath) => {
    const accessCode = accessCodeFromGiftPath(giftPath)
    if (!accessCode) throw new Error('Không xác định được người nhận.')
    await giftRepository.createLetter(accessCode, {
      sender_name: wishForm.isAnonymous ? null : wishForm.senderName.trim(),
      title: wishForm.title.trim() || null,
      content: wishForm.content.trim(),
      is_anonymous: wishForm.isAnonymous,
      reveal_at: wishForm.revealAt || null,
    })
    setWishMatches([])
    setWishMessage(
      wishForm.revealAt
        ? `Đã gửi lời chúc bí mật — sẽ hiện đúng lúc ${new Date(wishForm.revealAt).toLocaleString('vi-VN')}.`
        : 'Đã gửi lời chúc. Lời chúc sẽ xuất hiện sau khi admin duyệt.'
    )
    setWishForm({ isAnonymous: false, senderName: '', receiverName: '', title: '', content: '', revealAt: '' })
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
      const result = await giftRepository.resolveStudent(receiverName)
      if (result?.giftPath) await sendWishToGiftPath(result.giftPath)
      else if (result?.matches?.length) {
        setWishMatches(result.matches)
        setWishMessage('Có nhiều bạn trùng tên. Hãy chọn đúng người nhận lời chúc.')
      } else {
        // Response không có giftPath lẫn matches (mock trả null, backend đổi shape)
        setWishError('Không tìm thấy người nhận trong danh sách.')
      }
    } catch (err) {
      if (err.status === 404) setWishError('Không tìm thấy người nhận trong danh sách.')
      else setWishError(err.message || 'Không gửi được lời chúc.')
    } finally {
      setWishSubmitting(false)
    }
  }

  const chooseRole = (role) => {
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

    // Khách KHÔNG tra danh sách lớp — đi thẳng tới trang lời chúc dành cho khách
    if (visitorRole === 'guest') {
      navigate(`/celebrate/${encodeURIComponent(value)}?audience=visitor`)
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

  // Show reveal animation
  if (revealPath) {
    return (
      <GiftReveal
        recipientName={revealName}
        onComplete={() => navigate(revealPath, revealStudent ? { state: { student: revealStudent } } : undefined)}
      />
    )
  }

  return (
    <main className="landing-page">
      <SeatLetterReveal student={seatRevealStudent} />
      <section className="landing-card">
        <p className="landing-date">20 · 10</p>
        <h1>Một món quà nhỏ<br />dành riêng cho bạn</h1>
        <p className="landing-intro">Nhập tên để mở không gian lưu bút và những lời chúc từ lớp mình.</p>
        {!visitorRole ? (
          <div className="landing-role-choice">
            <p>Trước tiên, cho tụi mình biết bạn là ai nhé:</p>
            <button type="button" onClick={() => chooseRole('classmate')}>🧑‍🎓 Mình là thành viên trong lớp</button>
            <button type="button" onClick={() => chooseRole('guest')}>🌸 Mình là khách ghé thăm</button>
          </div>
        ) : (
          <>
            <form className="landing-search" onSubmit={submit}>
              <label htmlFor="student-name">Tên của bạn</label>
              <p id="student-name-help" className="landing-help">
                {visitorRole === 'guest'
                  ? 'Nhập tên của bạn để nhận một lời chúc 20/10 dành riêng cho bạn.'
                  : 'Nhập họ tên hoặc tên thường gọi của bạn trong lớp.'}
              </p>
              <div><input id="student-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={visitorRole === 'guest' ? 'Ví dụ: Minh Thư' : 'Ví dụ: Nguyễn Thúy Vy'} autoComplete="name" aria-describedby="student-name-help" /><button disabled={loading} aria-busy={loading}>{loading ? 'Đang tìm...' : visitorRole === 'guest' ? 'Nhận lời chúc' : 'Mở quà'}</button></div>
            </form>
            <button type="button" className="landing-role-back" onClick={() => chooseRole(null)}>← Chọn lại</button>
          </>
        )}
        <div className="landing-secondary-actions">
          <button type="button" onClick={openWish}>Gửi lời chúc</button>
        </div>
        {error && <p className="landing-alert" role="alert">{error}</p>}
        {matches.length > 0 && <div className="landing-matches" aria-live="polite"><p>{message}</p>{matches.map((match) => <button key={match.giftPath} onClick={() => openGiftWithReveal(match.giftPath, match.displayName)}>
          {match.avatarUrl ? <img src={match.avatarUrl} alt="" /> : <span>{match.displayName.charAt(0)}</span>}
          <span><strong>{match.displayName}</strong>{match.nickname && <small>{match.nickname}</small>}</span>
        </button>)}</div>}
      </section>
      {wishOpen && (
        <div className="wish-modal-backdrop" role="presentation" onClick={() => setWishOpen(false)}>
          <section ref={wishDialogRef} className="wish-modal" role="dialog" aria-modal="true" aria-labelledby="wish-modal-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="wish-modal-close" onClick={() => setWishOpen(false)} aria-label="Đóng">×</button>
            <h2 id="wish-modal-title">Gửi lời chúc</h2>
            <form className="wish-form" onSubmit={submitWish}>
              <fieldset>
                <legend>Trạng thái</legend>
                <label><input type="radio" name="wish-visibility" checked={!wishForm.isAnonymous} onChange={() => setWishForm({ ...wishForm, isAnonymous: false })} /> Không ẩn danh</label>
                <label><input type="radio" name="wish-visibility" checked={wishForm.isAnonymous} onChange={() => setWishForm({ ...wishForm, isAnonymous: true, senderName: '' })} /> Ẩn danh</label>
              </fieldset>
              {!wishForm.isAnonymous && <label>Tên của bạn<input value={wishForm.senderName} maxLength={100} onChange={(event) => setWishForm({ ...wishForm, senderName: event.target.value })} placeholder="Ví dụ: Nguyễn Văn A" /></label>}
              <label>Tên người nhận<input value={wishForm.receiverName} maxLength={100} onChange={(event) => setWishForm({ ...wishForm, receiverName: event.target.value })} placeholder="Ví dụ: Phương Anh" /></label>
              <label>
                Tiêu đề <span className="wish-optional">(tuỳ chọn)</span>
                <input
                  value={wishForm.title}
                  maxLength={200}
                  onChange={(event) => setWishForm({ ...wishForm, title: event.target.value })}
                  placeholder="Ví dụ: Gửi người bạn đặc biệt..."
                />
              </label>
              <label>Lời chúc<textarea value={wishForm.content} maxLength={5000} onChange={(event) => setWishForm({ ...wishForm, content: event.target.value })} placeholder="Bạn hãy nhập lời chúc của bạn vào đây..." rows={5} /></label>
              <label>
                ⏰ Hiện lúc <span className="wish-optional">(tùy chọn — để trống = hiện ngay khi duyệt)</span>
                <input
                  type="datetime-local"
                  value={wishForm.revealAt}
                  min={revealLimits.min}
                  max={revealLimits.max}
                  onChange={(e) => setWishForm({ ...wishForm, revealAt: e.target.value })}
                />
              </label>
              {wishError && <p className="landing-alert" role="alert">{wishError}</p>}
              {wishMessage && <p className="wish-success" role="status">{wishMessage}</p>}
              {wishMatches.length > 0 && <div className="landing-matches wish-matches">{wishMatches.map((match) => <button type="button" key={match.giftPath} onClick={async () => {
                setWishSubmitting(true)
                setWishError('')
                try { await sendWishToGiftPath(match.giftPath) }
                catch (err) { setWishError(err.message || 'Không gửi được lời chúc.') }
                finally { setWishSubmitting(false) }
              }}>
                {match.avatarUrl ? <img src={match.avatarUrl} alt="" /> : <span>{match.displayName.charAt(0)}</span>}
                <span><strong>{match.displayName}</strong>{match.nickname && <small>{match.nickname}</small>}</span>
              </button>)}</div>}
              <button className="wish-submit" disabled={wishSubmitting}>{wishSubmitting ? 'Đang gửi...' : 'Xong'}</button>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default LandingPage
