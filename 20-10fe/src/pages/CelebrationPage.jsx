import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import '../styles/celebration.css'

function CelebrationPage() {
  const { name: routeName } = useParams()
  const name = (routeName || '').slice(0, 100)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    giftRepository.generateGreeting(name)
      .then((data) => { if (!cancelled) setResult(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [name, retry])

  return <main className="celebration-page"><section className="celebration-card">
    <div className="celebration-flowers">🌷 ✨ 🌸</div>
    <p className="celebration-label">Một lời chúc bất ngờ dành cho</p><h1>{name}</h1>
    {!result && !error && <p>Đang viết lời chúc cho bạn...</p>}
    {result && <p className="celebration-message">{result.greeting}</p>}
    {error && <><p className="landing-alert">{error}</p><button onClick={() => { setError(''); setRetry((value) => value + 1) }}>Thử lại</button></>}
    <Link to="/">Tìm một cái tên khác</Link>
  </section></main>
}

export default CelebrationPage
