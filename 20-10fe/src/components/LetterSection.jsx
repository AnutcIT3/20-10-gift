import { useState, useCallback, useRef } from 'react'
import EmptyState from './EmptyState'
import Polaroid from './paper/Polaroid'
import Stamp from './paper/Stamp'
import api from '../services/api'
import { formatStamp } from '../lib/event'

// ── Reaction config — 8 emoji, 4 đầu hiện sẵn, còn lại sau chip "+N" ────────
const REACTIONS = [
  { emoji: '🙂', key: 'smile',    label: 'Vui vẻ' },
  { emoji: '😄', key: 'laugh',    label: 'Hạnh phúc' },
  { emoji: '😍', key: 'love',     label: 'Yêu thích' },
  { emoji: '👍', key: 'thumbsup', label: 'Tuyệt vời' },
  { emoji: '😘', key: 'kiss',     label: 'Cảm ơn' },
  { emoji: '🤔', key: 'think',    label: 'Thú vị' },
  { emoji: '😞', key: 'sad',      label: 'Buồn' },
  { emoji: '😠', key: 'angry',    label: 'Tức giận' },
]
const PRIMARY_COUNT = 4

// ── Reaction Bar ──────────────────────────────────────────────────────────────
function ReactionBar({ letter, accessCode }) {
  const [counts, setCounts] = useState(letter.reactions || {})
  const [active, setActive] = useState(letter.myReaction || null)
  const [burst, setBurst] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const pendingRef = useRef(false)

  const handleReact = useCallback(async (key) => {
    if (pendingRef.current) return
    pendingRef.current = true

    // Optimistic update
    const prevActive = active
    const prevCounts = { ...counts }
    const next = active === key ? null : key

    setCounts((prev) => {
      const c = { ...prev }
      if (prevActive) c[prevActive] = Math.max(0, (c[prevActive] || 1) - 1)
      if (next) c[next] = (c[next] || 0) + 1
      return c
    })
    setActive(next)
    if (next) { setBurst(key); setTimeout(() => setBurst(null), 500) }

    try {
      // api.js tự gắn x-session-id header
      const res = await api.post(
        `/api/gifts/${encodeURIComponent(accessCode)}/letters/${letter.id}/react`,
        { emojiKey: key },
      )
      const data = res.data?.data
      if (data) {
        setCounts(data.counts || {})
        setActive(data.active || null)
      }
    } catch {
      // Rollback nếu lỗi
      setCounts(prevCounts)
      setActive(prevActive)
    } finally {
      pendingRef.current = false
    }
  }, [active, counts, letter.id, accessCode])

  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  // Emoji đang chọn luôn hiện dù không nằm trong 4 emoji đầu
  const visible = showAll
    ? REACTIONS
    : REACTIONS.filter((reaction, index) => index < PRIMARY_COUNT || reaction.key === active)
  const hiddenCount = REACTIONS.length - visible.length

  return (
    <div className="reactions" aria-label="Thả cảm xúc">
      {visible.map(({ emoji, key, label }) => {
        const count = counts[key] || 0
        return (
          <button
            key={key}
            type="button"
            className={`react-btn${active === key ? ' is-active' : ''}${burst === key ? ' reaction-burst' : ''}`}
            onClick={() => handleReact(key)}
            aria-pressed={active === key}
            aria-label={`${label}${count ? ` (${count})` : ''}`}
            title={label}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <b>{count}</b>}
          </button>
        )
      })}
      {hiddenCount > 0 && (
        <button type="button" className="btn-dashed react-more" onClick={() => setShowAll(true)} aria-label={`Thêm ${hiddenCount} cảm xúc khác`}>
          +{hiddenCount}
        </button>
      )}
      {showAll && (
        <button type="button" className="btn-dashed react-more" onClick={() => setShowAll(false)}>thu gọn</button>
      )}
      <span className="sr-only" aria-live="polite">{total > 0 ? `${total} cảm xúc` : ''}</span>
    </div>
  )
}

// ── Letter Card: tờ giấy kẻ dòng có tem ─────────────────────────────────────
function LetterCard({ letter, accessCode, index }) {
  const anonymous = letter.is_anonymous || !letter.sender_name
  // Thư đầu mỗi hàng nghiêng nhẹ; thư thứ hai nghiêng ngược và hạ thấp
  const rotate = index === 1 ? 0.8 : index % 2 === 0 ? -0.6 : 0
  const lift = index === 1 ? 18 : 0

  return (
    <article
      className="letter letter-paper"
      style={{ '--rot': `${rotate}deg`, '--lift': `${lift}px`, '--delay': `${0.4 + Math.min(index, 6) * 0.15}s` }}
    >
      <Stamp variant={anonymous ? 'anon' : 'date'} rotate={anonymous ? -5 : 6} className="letter__stamp" />
      {anonymous
        ? <p className="letter__sender letter__sender--anon">Một người bạn ẩn danh</p>
        : <p className="letter__sender">{letter.sender_name}</p>}
      {letter.title && <p className="letter__title">{letter.title}</p>}
      <p className="letter__content">{letter.content}</p>
      {letter.image_url && (
        <Polaroid src={letter.image_url} alt="Ảnh kèm lời chúc" small rotate={-2} lazy className="letter__photo" />
      )}
      <div className="letter__footer">
        <time dateTime={letter.created_at}>{formatStamp(letter.created_at)}</time>
        <ReactionBar letter={letter} accessCode={accessCode} />
      </div>
    </article>
  )
}

// ── Letter Section ────────────────────────────────────────────────────────────
function LetterSection({ letters = [], accessCode }) {
  return (
    <section className="gift__section gift__section--last" aria-labelledby="letters-title">
      <h2 id="letters-title" className="section-title">
        Những lời chúc dành cho bạn
        <span className="section-title__count">{letters.length ? `${letters.length} bức thư` : 'hộp thư còn trống'}</span>
      </h2>
      {letters.length > 0
        ? (
          <div className="letters">
            {letters.map((letter, index) => (
              <LetterCard key={letter.id} letter={letter} accessCode={accessCode} index={index} />
            ))}
          </div>
        )
        : (
          <div className="letter-paper letters__empty">
            <EmptyState icon="💌" message="Chưa có lời chúc nào… hãy là người đầu tiên gửi nhé!" />
          </div>
        )}
    </section>
  )
}

export default LetterSection
