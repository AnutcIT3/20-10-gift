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
          <div><input id="student-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Nguyễn Thúy Vy" autoComplete="name" /><button disabled={loading}>{loading ? 'Đang tìm...' : 'Mở quà'}</button></div>
        </form>
        {error && <p className="landing-alert">{error}</p>}
        {matches.length > 0 && <div className="landing-matches"><p>{message}</p>{matches.map((match) => <button key={match.giftPath} onClick={() => navigate(match.giftPath)}>
          {match.avatarUrl ? <img src={match.avatarUrl} alt="" /> : <span>{match.displayName.charAt(0)}</span>}
          <span><strong>{match.displayName}</strong>{match.nickname && <small>{match.nickname}</small>}</span>
        </button>)}</div>}
      </section>
    </main>
  )
}

export default LandingPage
