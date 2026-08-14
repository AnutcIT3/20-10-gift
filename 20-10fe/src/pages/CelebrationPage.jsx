import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import '../styles/celebration.css'

// Fallback khi API lỗi — khớp nội dung tĩnh phía backend
const FALLBACKS = {
  visitor: (name) => `Dù chúng mình có thể chưa từng học cùng nhau, ${name} vẫn là một bông hoa nhỏ xứng đáng nhận được những lời chúc tốt đẹp. Chúc bạn có một ngày 20/10 thật vui vẻ, luôn rạng rỡ, tự tin và gặp nhiều may mắn! 🌷`,
  classmate: (name) => `Cảm ơn ${name} đã là một phần của tập thể lớp mình! Chúc cậu một ngày 20/10 thật vui bên cả lớp, luôn giữ năng lượng tích cực và mọi dự định sắp tới đều thuận lợi nhé! 🌷`,
}

function CelebrationPage() {
  const { name: routeName } = useParams()
  const [searchParams] = useSearchParams()
  const name = (routeName || '').normalize('NFC').slice(0, 100)
  // Trang chủ đã hỏi "là ai" trước khi nhập tên và truyền qua ?audience= —
  // chỉ hỏi lại khi vào thẳng bằng link không có thông tin đó
  const presetAudience = ['classmate', 'visitor'].includes(searchParams.get('audience'))
    ? searchParams.get('audience')
    : null
  const [audience, setAudience] = useState(presetAudience)
  const [result, setResult] = useState(null)

  const chooseAudience = (type) => {
    setResult(null)
    setAudience(type)
  }

  useEffect(() => {
    if (!audience) return undefined
    let cancelled = false
    giftRepository.generateGreeting(name, audience)
      .then((data) => { if (!cancelled) setResult({ ...data, requestName: name, audience }) })
      .catch(() => {
        if (!cancelled) {
          setResult({ greeting: FALLBACKS[audience](name), requestName: name, audience })
        }
      })
    return () => { cancelled = true }
  }, [name, audience])

  const currentResult =
    result?.requestName === name && result?.audience === audience ? result : null

  return <main className="celebration-page"><section className="celebration-card">
    <div className="celebration-flowers">🌷 ✨ 🌸</div>
    <p className="celebration-label">Một lời chúc bất ngờ dành cho</p><h1>{name}</h1>
    {!audience ? (
      <div className="celebration-choice">
        <p>Cho tụi mình biết một chút để lời chúc đúng ý hơn nhé:</p>
        <button type="button" onClick={() => chooseAudience('classmate')}>
          🧑‍🎓 Mình là thành viên trong lớp
        </button>
        <button type="button" onClick={() => chooseAudience('visitor')}>
          🌸 Mình là khách ghé thăm
        </button>
      </div>
    ) : (
      <div aria-live="polite">
        {!currentResult && <p className="celebration-loading">Đang chuẩn bị một lời chúc cho bạn...</p>}
        {currentResult && <p className="celebration-message">{currentResult.greeting}</p>}
        {currentResult && (
          <button type="button" className="celebration-switch" onClick={() => setAudience(null)}>
            Chọn lại
          </button>
        )}
      </div>
    )}
    <Link className="celebration-home-link" to="/">Về trang chủ</Link>
  </section></main>
}

export default CelebrationPage
