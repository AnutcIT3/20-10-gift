import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import '../styles/landing.css'

function LandingPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [matches, setMatches] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [wishOpen, setWishOpen] = useState(false)
  const [wishForm, setWishForm] = useState({
    isAnonymous: false,
    senderName: '',
    receiverName: '',
    content: '',
  })
  const [wishMatches, setWishMatches] = useState([])
  const [wishMessage, setWishMessage] = useState('')
  const [wishError, setWishError] = useState('')
  const [wishSubmitting, setWishSubmitting] = useState(false)

  const resetWish = () => {
    setWishForm({ isAnonymous: false, senderName: '', receiverName: '', content: '' })
    setWishMatches([])
    setWishMessage('')
    setWishError('')
  }

  const accessCodeFromGiftPath = (giftPath) => giftPath.split('/').filter(Boolean).pop()

  const sendWishToGiftPath = async (giftPath) => {
    const accessCode = accessCodeFromGiftPath(giftPath)
    if (!accessCode) throw new Error('Không xác định được người nhận.')
    await giftRepository.createLetter(accessCode, {
      sender_name: wishForm.isAnonymous ? null : wishForm.senderName.trim(),
      content: wishForm.content.trim(),
      is_anonymous: wishForm.isAnonymous,
    })
    setWishMatches([])
    setWishMessage('Đã gửi lời chúc. Lời chúc sẽ xuất hiện sau khi admin duyệt.')
    setWishForm({ isAnonymous: false, senderName: '', receiverName: '', content: '' })
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
      if (result.giftPath) await sendWishToGiftPath(result.giftPath)
      else if (result.matches?.length) {
        setWishMatches(result.matches)
        setWishMessage('Có nhiều bạn trùng tên. Hãy chọn đúng người nhận lời chúc.')
      }
    } catch (err) {
      if (err.status === 404) setWishError('Không tìm thấy người nhận trong danh sách.')
      else setWishError(err.message || 'Không gửi được lời chúc.')
    } finally {
      setWishSubmitting(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const value = name.trim()
    setError(''); setMatches([]); setMessage('')
    if (value.length < 2) { setError('Vui lòng nhập ít nhất 2 ký tự.'); return }
    setLoading(true)
    try {
      const result = await giftRepository.resolveStudent(value)
      if (result.giftPath) navigate(result.giftPath)
      else { setMatches(result.matches || []); setMessage(result.message || '') }
    } catch (err) {
      if (err.status === 404) navigate(`/celebrate/${encodeURIComponent(value)}`)
      else if (!navigator.onLine || err.isNetworkError) setError('Bạn đang offline hoặc backend chưa được bật.')
      else setError(err.message)
    } finally { setLoading(false) }
  }

  return (
    <main className="landing-page">
      <section className="landing-card">
        <p className="landing-date">20 · 10</p>
        <h1>Một món quà nhỏ<br />dành riêng cho bạn</h1>
        <p className="landing-intro">Nhập tên để mở không gian lưu bút và những lời chúc từ lớp mình.</p>
        <form className="landing-search" onSubmit={submit}>
          <label htmlFor="student-name">Tên của bạn</label>
          <p id="student-name-help" className="landing-help">Nhập họ tên hoặc tên thường gọi của bạn.</p>
          <div><input id="student-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Nguyễn Thúy Vy" autoComplete="name" aria-describedby="student-name-help" /><button disabled={loading} aria-busy={loading}>{loading ? 'Đang tìm...' : 'Mở quà'}</button></div>
        </form>
        <div className="landing-secondary-actions">
          <button type="button" onClick={() => { resetWish(); setWishOpen(true) }}>Gửi lời chúc</button>
        </div>
        {error && <p className="landing-alert" role="alert">{error}</p>}
        {matches.length > 0 && <div className="landing-matches" aria-live="polite"><p>{message}</p>{matches.map((match) => <button key={match.giftPath} onClick={() => navigate(match.giftPath)}>
          {match.avatarUrl ? <img src={match.avatarUrl} alt="" /> : <span>{match.displayName.charAt(0)}</span>}
          <span><strong>{match.displayName}</strong>{match.nickname && <small>{match.nickname}</small>}</span>
        </button>)}</div>}
      </section>
      {wishOpen && (
        <div className="wish-modal-backdrop" role="presentation" onClick={() => setWishOpen(false)}>
          <section className="wish-modal" role="dialog" aria-modal="true" aria-labelledby="wish-modal-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="wish-modal-close" onClick={() => setWishOpen(false)} aria-label="Đóng">×</button>
            <h2 id="wish-modal-title">Gửi lời chúc</h2>
            <form className="wish-form" onSubmit={submitWish}>
              <fieldset>
                <legend>Trạng thái</legend>
                <label><input type="radio" checked={!wishForm.isAnonymous} onChange={() => setWishForm({ ...wishForm, isAnonymous: false })} /> Không ẩn danh</label>
                <label><input type="radio" checked={wishForm.isAnonymous} onChange={() => setWishForm({ ...wishForm, isAnonymous: true, senderName: '' })} /> Ẩn danh</label>
              </fieldset>
              {!wishForm.isAnonymous && <label>Tên của bạn<input value={wishForm.senderName} maxLength={100} onChange={(event) => setWishForm({ ...wishForm, senderName: event.target.value })} placeholder="Ví dụ: Nguyễn Văn A" /></label>}
              <label>Tên người nhận<input value={wishForm.receiverName} maxLength={100} onChange={(event) => setWishForm({ ...wishForm, receiverName: event.target.value })} placeholder="Ví dụ: Phương Anh" /></label>
              <label>Lời chúc<textarea value={wishForm.content} maxLength={5000} onChange={(event) => setWishForm({ ...wishForm, content: event.target.value })} placeholder="Bạn hãy nhập lời chúc của bạn vào đây..." rows={5} /></label>
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
