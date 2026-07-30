import { useState, useCallback, useRef } from 'react'
import EmptyState from './EmptyState'
import api from '../services/api'

// ── Reaction config — 8 emoji ─────────────────────────────────────────────────
const REACTIONS = [
  { emoji: '🙂', key: 'smile',    label: 'Vui vẻ' },
  { emoji: '😄', key: 'laugh',    label: 'Hạnh phúc' },
  { emoji: '😠', key: 'angry',    label: 'Tức giận' },
  { emoji: '😘', key: 'kiss',     label: 'Cảm ơn' },
  { emoji: '😍', key: 'love',     label: 'Yêu thích' },
  { emoji: '😞', key: 'sad',      label: 'Buồn' },
  { emoji: '👍', key: 'thumbsup', label: 'Tuyệt vời' },
  { emoji: '🤔', key: 'think',    label: 'Thú vị' },
]

// ── Reaction Bar ──────────────────────────────────────────────────────────────
function ReactionBar({ letter, accessCode }) {
  const [counts, setCounts] = useState(letter.reactions || {})
  const [active, setActive] = useState(letter.myReaction || null)
  const [burst, setBurst] = useState(null)
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

  return (
    <div className="reaction-bar" aria-label="Thả cảm xúc">
      {REACTIONS.map(({ emoji, key, label }) => {
        const count = counts[key] || 0
        return (
          <button
            key={key}
            type="button"
            className={`reaction-btn${active === key ? ' reaction-active' : ''}${burst === key ? ' reaction-burst' : ''}`}
            onClick={() => handleReact(key)}
            aria-pressed={active === key}
            aria-label={`${label}${count ? ` (${count})` : ''}`}
            title={label}
          >
            <span className="reaction-emoji" aria-hidden="true">{emoji}</span>
            {count > 0 && <span className="reaction-count">{count}</span>}
          </button>
        )
      })}
      {total > 0 && <span className="reaction-total" aria-live="polite">{total} cảm xúc</span>}
    </div>
  )
}

// ── Letter Card ───────────────────────────────────────────────────────────────
function LetterCard({ letter, accessCode }) {
  return (
    <div className="letter-card">
      <div className="letter-header">
        {letter.is_anonymous || !letter.sender_name ? (
          <span className="letter-sender letter-anonymous">Ẩn danh</span>
        ) : (
          <span className="letter-sender">{letter.sender_name}</span>
        )}
        {letter.title && <span className="letter-title">{letter.title}</span>}
      </div>
      <p className="letter-content">{letter.content}</p>
      <div className="letter-footer">
        <time className="letter-date">
          {new Date(letter.created_at).toLocaleDateString('vi-VN', {
            day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </time>
        <ReactionBar letter={letter} accessCode={accessCode} />
      </div>
    </div>
  )
}

// ── Letter Section ────────────────────────────────────────────────────────────
function LetterSection({ letters = [], accessCode }) {
  return (
    <section className="letters-section">
      <h2 className="section-title">💌 Những lời chúc dành cho bạn</h2>
      {letters.length > 0
        ? <div className="letters-list">{letters.map((letter) => <LetterCard key={letter.id} letter={letter} accessCode={accessCode} />)}</div>
        : <EmptyState icon="💬" message="Chưa có lời chúc nào..." />}
    </section>
  )
}

export default LetterSection
