import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import '../styles/celebration.css'

function CelebrationPage() {
  const { name: routeName } = useParams()
  const name = (routeName || '').slice(0, 100)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    giftRepository.generateGreeting(name, 'visitor')
      .then((data) => { if (!cancelled) setResult({ ...data, requestName: name }) })
      .catch(() => {
        if (!cancelled) {
          setResult({
            greeting: `Dù chúng mình có thể chưa từng học cùng nhau, ${name} vẫn là một bông hoa nhỏ xứng đáng nhận được những lời chúc tốt đẹp. Chúc bạn có một ngày 20/10 thật vui vẻ, luôn rạng rỡ, tự tin và gặp nhiều may mắn! 🌷`,
            requestName: name,
          })
        }
      })
    return () => { cancelled = true }
  }, [name])

  const currentResult =
    result?.requestName === name ? result : null

  return <main className="celebration-page"><section className="celebration-card">
    <div className="celebration-flowers">🌷 ✨ 🌸</div>
    <p className="celebration-label">Một lời chúc bất ngờ dành cho</p><h1>{name}</h1>
    <div aria-live="polite">
      {!currentResult && <p className="celebration-loading">Đang chuẩn bị một lời chúc cho bạn...</p>}
      {currentResult && <p className="celebration-message">{currentResult.greeting}</p>}
    </div>
    <Link className="celebration-home-link" to="/">Về trang chủ</Link>
  </section></main>
}

export default CelebrationPage
