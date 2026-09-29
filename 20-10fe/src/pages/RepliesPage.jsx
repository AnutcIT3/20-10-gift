import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import giftRepository from '../api/giftRepository'
import EmptyState from '../components/EmptyState'
import PaperError from '../components/PaperError'
import Petals from '../components/paper/Petals'
import Postmark from '../components/paper/Postmark'
import { CLASS_LABEL, CLASS_NAME, formatStamp } from '../lib/event'
import '../styles/replies.css'

const ROTATIONS = [-0.8, 0.6, -0.3, 0.9]
// Cùng ngưỡng với máy chủ: ít hơn 2 chữ cái/chữ số thì khớp gần như mọi tên
// (dấu chấm, emoji không tính — máy chủ sẽ trả 400 và cả trang thành màn lỗi)
const MIN_QUERY = 2

const searchable = (value) => {
  const trimmed = (value || '').trim()
  const letters = trimmed.match(/[\p{L}\p{N}]/gu) || []
  return letters.length >= MIN_QUERY ? trimmed : ''
}

function recipientLabel(to) {
  if (to?.kind === 'person') return to.name
  if (to?.kind === 'anonymous') return 'một người bạn ẩn danh'
  if (to?.kind === 'admin') return 'admin'
  return `cả lớp ${CLASS_NAME}`
}

// Tấm bưu thiếp hồi âm: "Vy ✉ → Tuấn", nội dung, dấu ngày
function ReplyCard({ reply, index }) {
  const anonymous = reply.to?.kind === 'anonymous'
  return (
    <article
      className="reply-card"
      style={{ '--rot': `${ROTATIONS[index % ROTATIONS.length]}deg`, '--delay': `${Math.min(index, 8) * 0.08}s` }}
    >
      <span className="tape tape--center" aria-hidden="true" />
      <p className="reply-card__route">
        <b className="reply-card__from">{reply.from?.name}</b>
        <span className="reply-card__arrow" aria-hidden="true">✉ →</span>
        <span className="sr-only">gửi</span>
        <b className={`reply-card__to${anonymous ? ' reply-card__to--anon' : ''}`}>{recipientLabel(reply.to)}</b>
      </p>
      {/* Người gửi ẩn danh nhận ra hồi âm của mình qua lúc họ gửi thư */}
      {anonymous && reply.to.letterSentAt && (
        <p className="reply-card__hint">người đã gửi thư lúc {formatStamp(reply.to.letterSentAt)}</p>
      )}
      <p className="reply-card__body">{reply.content}</p>
      <time className="reply-card__time" dateTime={reply.created_at}>{formatStamp(reply.created_at)}</time>
    </article>
  )
}

/**
 * Hộp thư hồi âm (/hoi-am): các bạn nữ đọc thư xong viết lại cho người gửi,
 * cho cả lớp hay cho admin — hồi âm đã duyệt hiện ở đây, mới nhất trước.
 * Ô "Tên cậu" lọc những hồi âm gửi đích danh một người (không dấu cũng được).
 * Đến từ lời nhắc "có thư gửi cậu" (?exact=1) thì khớp trọn chữ như lời nhắc
 * đã đếm; gõ lại tên trong ô là về kiểu tìm từ đầu chữ.
 */
function RepliesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const to = searchable(searchParams.get('to'))
  const exact = Boolean(to) && searchParams.get('exact') === '1'
  const [query, setQuery] = useState(to)
  const [retryKey, setRetryKey] = useState(0)
  const [state, setState] = useState({ loading: true, items: [], total: 0, error: '', locked: false, to: null })

  // Gõ tên: chờ 350 ms rồi mới đẩy vào URL để không gọi API theo từng phím;
  // dưới 2 ký tự thì coi như chưa lọc
  useEffect(() => {
    const next = searchable(query)
    if (next === to) return undefined
    const timer = setTimeout(() => setSearchParams(next ? { to: next } : {}, { replace: true }), 350)
    return () => clearTimeout(timer)
  }, [query, to, setSearchParams])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setState((current) => ({ ...current, loading: true }))
      try {
        const data = await giftRepository.listReplies({ to: to || undefined, exact })
        if (!cancelled) {
          const items = data?.items || []
          setState({ loading: false, items, total: Number(data?.total ?? items.length), error: '', locked: false, to })
        }
      } catch (err) {
        if (cancelled) return
        setState({
          loading: false,
          items: [],
          total: 0,
          error: err.status === 423 ? '' : (err.message || 'Có lỗi xảy ra, thử lại sau nhé.'),
          locked: err.status === 423,
          to,
        })
      }
    }
    // setTimeout 0 để setState không chạy đồng bộ trong effect (react-hooks v7)
    const timer = setTimeout(load, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [to, exact, retryKey])

  if (state.locked) {
    return (
      <PaperError
        title="Hộp thư chưa mở"
        stamp={['CHƯA', 'MỞ', { big: 'HỘP' }]}
        message="Hộp thư hồi âm mở cùng trang quà vào ngày 20/10. Quay lại sau nhé! 💌"
      />
    )
  }

  if (state.error) {
    return (
      <PaperError
        title="Chưa mở được hộp thư"
        stamp={['CÓ', 'LỖI', { big: 'RỒI' }]}
        message={state.error}
        onRetry={() => setRetryKey((key) => key + 1)}
      />
    )
  }

  const { items, total } = state
  const showingFor = state.to
  // Máy chủ trả tối đa 300 lá mới nhất; tổng vẫn đúng như số trên trang chủ
  const partial = total > items.length ? ` · hiện ${items.length} lá mới nhất` : ''

  return (
    <main className="replies-page page-paper">
      <Petals count={2} />
      <div className="replies-page__inner">
        <header className="replies-page__header">
          <Link to="/" className="replies-page__back">← Trang chủ</Link>
          <p className="replies-page__brand">
            <img src="/logoclass.jpg" alt="" />
            <span>{CLASS_LABEL}</span>
          </p>
        </header>

        <section className="replies-hero">
          <Postmark moss size={96} rotate={-10} lines={['HỒI', 'ÂM', { big: '20.10' }]} className="replies-hero__postmark" />
          <h1>Hộp thư hồi âm</h1>
          <p className="replies-hero__intro">
            Đọc thư xong, các bạn nữ viết lại đôi dòng cho người đã gửi. Tìm tên cậu xem có ai hồi âm cho cậu không nhé!
          </p>
          <label className="field-hand replies-search" htmlFor="replies-to">
            Tên cậu:
            <input
              id="replies-to"
              className="input-hand"
              value={query}
              maxLength={100}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ví dụ: Tuấn"
              autoComplete="name"
              aria-describedby="replies-to-hint"
            />
          </label>
          <p id="replies-to-hint" className="replies-search__hint">
            {query.trim() && !searchable(query) ? 'Gõ ít nhất 2 chữ nhé.' : 'Gõ tên không dấu cũng được.'}
          </p>
        </section>

        <p className="replies-count" aria-live="polite">
          {state.loading
            ? 'Đang mở hộp thư…'
            : showingFor
              ? `${total} hồi âm gửi ${showingFor}${partial}`
              : `${total} hồi âm${partial}`}
        </p>

        {items.length > 0 ? (
          <div className={`reply-cards${state.loading ? ' is-refreshing' : ''}`}>
            {items.map((reply, index) => <ReplyCard key={reply.id} reply={reply} index={index} />)}
          </div>
        ) : !state.loading && (
          <div className="letter-paper replies-empty">
            <EmptyState
              icon="📭"
              message={showingFor
                ? `Chưa có hồi âm nào gửi đích danh ${showingFor}… thử tên khác, hoặc xem hết nhé.`
                : 'Chưa có hồi âm nào… các bạn nữ đang đọc thư đó! 💌'}
            />
          </div>
        )}

        {showingFor && (
          <p className="replies-all">
            <button type="button" className="btn-dashed" onClick={() => setQuery('')}>Xem tất cả hồi âm</button>
          </p>
        )}

        <footer className="replies-page__footer">
          <img src="/logoclass.jpg" alt="" />
          <span>{CLASS_LABEL}</span>
        </footer>
      </div>
    </main>
  )
}

export default RepliesPage
