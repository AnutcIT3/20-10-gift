import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import Petals from '../components/paper/Petals'
import Postmark from '../components/paper/Postmark'
import Stamp from '../components/paper/Stamp'
import { CLASS_NAME, EVENT_YEAR } from '../lib/event'
import '../styles/celebration.css'

// Fallback khi API lỗi — khớp nội dung tĩnh phía backend
const FALLBACKS = {
  visitor: (name) => `Dù chúng mình có thể chưa từng học cùng nhau, ${name} vẫn là một bông hoa nhỏ xứng đáng nhận được những lời chúc tốt đẹp. Chúc bạn có một ngày 20/10 thật vui vẻ, luôn rạng rỡ, tự tin và gặp nhiều may mắn! 🌷`,
  classmate: (name) => `Cảm ơn ${name} đã là một phần của lớp mình! Chúc cậu một ngày 20/10 thật vui, luôn giữ năng lượng tích cực và mọi dự định sắp tới đều thuận lợi nhé! 🌷`,
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
  // Bạn cùng lớp (thường là các bạn nam) gõ tên mình: có bạn nữ nào hồi âm
  // đích danh cho cậu ấy không? { name, count }
  const [replyInfo, setReplyInfo] = useState(null)

  const chooseAudience = (type) => {
    setResult(null)
    setAudience(type)
  }

  useEffect(() => {
    if (!audience) return undefined
    let cancelled = false
    giftRepository.generateGreeting(name, audience)
      .then((data) => { if (!cancelled) setResult({ ...data, requestName: name, audience }) })
      .catch((err) => {
        if (cancelled) return
        // Đang khóa chờ 20/10: KHÔNG dùng fallback tĩnh — khóa là khóa hết
        if (err?.status === 423) {
          setResult({ locked: true, requestName: name, audience })
        } else {
          setResult({ greeting: FALLBACKS[audience](name), requestName: name, audience })
        }
      })
    return () => { cancelled = true }
  }, [name, audience])

  useEffect(() => {
    if (audience !== 'classmate' || name.trim().length < 2) return undefined
    let cancelled = false
    giftRepository.listReplies({ to: name, exact: true })
      .then((data) => { if (!cancelled) setReplyInfo({ name, count: Number(data?.total || 0) }) })
      // Hộp thư còn khoá (423) hay lỗi mạng: chỉ đơn giản là không hiện gì
      .catch(() => {})
    return () => { cancelled = true }
  }, [name, audience])

  const replyCount = audience === 'classmate' && replyInfo?.name === name ? replyInfo.count : 0

  const currentResult =
    result?.requestName === name && result?.audience === audience ? result : null
  const hasGreeting = Boolean(currentResult && !currentResult.locked)

  return (
    <main className="celebrate page-paper">
      <Petals count={2} />
      {/* Bưu thiếp nghiêng trái lúc hỏi, nghiêng phải khi đã có lời chúc */}
      <section className={`postcard${audience ? ' postcard--flip' : ''}`}>
        <span className="tape tape--center" style={{ '--tape-rot': audience ? '-2deg' : '2deg' }} aria-hidden="true" />
        <div className="postcard__head">
          <div>
            <p className="postcard__label">Một lời chúc bất ngờ dành cho</p>
            <h1 className="postcard__name">{name}</h1>
          </div>
          <div className="postcard__marks">
            {hasGreeting && (
              <Postmark
                size={84}
                rotate={-10}
                animate
                delay={0.5}
                lines={[CLASS_NAME, { big: '20.10' }, String(EVENT_YEAR)]}
                className="postcard__postmark"
              />
            )}
            <Stamp variant="logo" inline rotate={4} className="postcard__logo" />
          </div>
        </div>

        {!audience ? (
          <>
            <p className="postcard__ask">Cho tụi mình biết một chút để lời chúc đúng ý hơn nhé:</p>
            <div className="postcard__choices">
              <button type="button" className="btn-stamp" onClick={() => chooseAudience('classmate')}>
                <span className="btn-stamp__icon" aria-hidden="true">✎</span>Mình là thành viên trong lớp
              </button>
              <button type="button" className="btn-stamp btn-stamp--moss" onClick={() => chooseAudience('visitor')}>
                <span className="btn-stamp__icon" aria-hidden="true">✿</span>Mình là khách ghé thăm
              </button>
            </div>
            <div className="postcard__foot postcard__foot--right">
              <Link className="link-dashed" to="/">Về trang chủ</Link>
            </div>
          </>
        ) : (
          <div aria-live="polite">
            {!currentResult && <p className="postcard__loading">Đang chuẩn bị một lời chúc cho bạn…</p>}
            {currentResult?.locked && (
              <p className="postcard__message">
                🎁 Chưa đến ngày 20/10 — lời chúc đang được gói lại chờ đúng ngày. Vui lòng quay lại sau nhé! 💝
              </p>
            )}
            {hasGreeting && <p className="postcard__message">{currentResult.greeting}</p>}
            {hasGreeting && replyCount > 0 && (
              <Link className="postcard__replies" to={`/hoi-am?to=${encodeURIComponent(name)}&exact=1`}>
                📬 Có {replyCount} thư hồi âm gửi {name} — đọc ngay
              </Link>
            )}
            <div className="postcard__foot">
              {hasGreeting
                ? <span className="postcard__sign">— {audience === 'classmate' ? `Lớp ${CLASS_NAME}` : `Các bạn nam ${CLASS_NAME}`}</span>
                : <span />}
              <div className="postcard__foot-actions">
                {hasGreeting && (
                  <button type="button" className="btn-dashed" onClick={() => setAudience(null)}>Chọn lại</button>
                )}
                <Link className="btn-ink" to="/">Về trang chủ</Link>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export default CelebrationPage
