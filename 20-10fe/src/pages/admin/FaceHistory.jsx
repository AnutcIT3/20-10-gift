import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi } from '../../api/adminApi'
import useDialogA11y from '../../hooks/useDialogA11y'
import { cld, CLD_TINY } from '../../lib/cloudinary'
import {
  FRAME_KINDS,
  ISSUES,
  deviceLabel,
  formatDuration,
  formatScore,
  formatSeconds,
  formatWhen,
  frameKind,
  isNearMiss,
  mergeScans,
  outcomeOf,
  sortMembers,
} from '../../lib/faceHistory'

const AUTO_REFRESH_MS = 30_000
const FILTERS = [
  ['all', 'Tất cả'],
  ['ok', 'Nhận đúng'],
  ['fail', 'Chưa thành'],
]
const EMPTY_LIST = Object.freeze({ items: [], nextBefore: null })

function StatCard({ value, label, tone = '' }) {
  return (
    <div className={`dash-stat${tone ? ` dash-stat--${tone}` : ''}`}>
      <b>{value ?? '—'}</b>
      <span>{label}</span>
    </div>
  )
}

// Chi tiết của một lượt đổi khi lượt đó có thêm khung, có kết quả hay được ghép tên
function detailKey(scan) {
  return `${scan.outcome}|${scan.frames}|${scan.claimed?.id ?? ''}`
}

// "Là ai" của một lượt, kèm cách biết: máy nhận ra, hay người đó gõ tên sau
function whoOf(scan) {
  const { member, suggested, outcome } = scan
  if (member?.via === 'face') return { name: member.name, note: 'máy nhận ra' }
  if (member) {
    const wrong = outcome === 'denied' && suggested ? ` · máy đoán nhầm là ${suggested.name}` : ''
    return { name: member.name, note: `gõ tên ngay sau đó${wrong}` }
  }
  return { name: null, note: suggested ? `máy đoán: ${suggested.name}` : '' }
}

function ScanDetail({ detail }) {
  if (!detail?.data && !detail?.error) return <p className="admin-loading face-scan__detail">Đang tải từng khung hình…</p>
  if (detail.error) return <p className="admin-hint face-scan__detail">{detail.error}</p>
  const scan = detail.data
  const { tau, margin, minFacePx, minBrightness, minBlur } = scan.thresholds
  const issue = scan.issue ? ISSUES[scan.issue] : null
  const below = (value, min) => (Number.isFinite(value) && value < min ? 'is-low' : undefined)
  return (
    <div className="face-scan__detail">
      {issue && <p className="face-scan__tip"><b>Gợi ý:</b> {issue.tip}</p>}
      {scan.timeline.length > 0 ? (
        <>
          <div className="face-strip" role="img" aria-label={`${scan.timeline.length} khung hình theo thời gian`}>
            {scan.timeline.map((frame) => {
              const kind = FRAME_KINDS[frameKind(frame)] || { label: frame.decision, tone: 'muted' }
              const score = Number.isFinite(frame.score) ? ` · điểm ${formatScore(frame.score)}` : ''
              return (
                <span
                  key={frame.id}
                  className={`face-strip__cell is-${kind.tone}`}
                  title={`${formatSeconds(frame.tMs)} · ${kind.label}${score}`}
                />
              )
            })}
          </div>
          <div className="face-frames-wrap">
            <table className="face-frames">
              <thead>
                <tr>
                  <th scope="col">Giây</th>
                  <th scope="col">Khung hình</th>
                  <th scope="col">Điểm</th>
                  <th scope="col">Cách biệt</th>
                  <th scope="col">Cỡ mặt</th>
                  <th scope="col">Sáng</th>
                  <th scope="col">Nét</th>
                  <th scope="col">Giống nhất</th>
                </tr>
              </thead>
              <tbody>
                {scan.timeline.map((frame) => {
                  const kind = FRAME_KINDS[frameKind(frame)] || { label: frame.decision, tone: 'muted' }
                  return (
                    <tr key={frame.id}>
                      <td>{formatSeconds(frame.tMs)}</td>
                      <td><span className={`face-dot is-${kind.tone}`} aria-hidden="true" />{kind.label}</td>
                      <td className={Number.isFinite(frame.score) && frame.score >= tau ? 'is-pass' : undefined}>{formatScore(frame.score)}</td>
                      <td className={below(frame.margin, margin)}>{formatScore(frame.margin)}</td>
                      <td className={below(frame.facePx, minFacePx)}>{Number.isFinite(frame.facePx) ? `${frame.facePx}px` : '—'}</td>
                      <td className={below(frame.brightness, minBrightness)}>{frame.brightness ?? '—'}</td>
                      <td className={below(frame.blur, minBlur)}>{frame.blur ?? '—'}</td>
                      <td>{frame.candidate?.name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="admin-hint">Không có khung hình nào tới được máy chủ trong lượt này.</p>
      )}
      {scan.darkFrames > 0 && (
        <p className="admin-hint">Thêm {scan.darkFrames} nhịp trình duyệt tự bỏ vì quá tối, không gửi lên.</p>
      )}
      <p className="admin-hint face-legend">
        Nhận ra khi điểm ≥ {formatScore(tau)} và cách người giống thứ hai ≥ {formatScore(margin)}.
        Khung chỉ được chấm điểm khi mặt ≥ {minFacePx}px, sáng ≥ {minBrightness}/255, nét ≥ {minBlur} — ô tô đỏ là dưới mức đó.
      </p>
    </div>
  )
}

function ScanRow({ scan, now, tau, expanded, onToggle, detail }) {
  const outcome = outcomeOf(scan, now)
  const who = whoOf(scan)
  const issue = scan.issue ? ISSUES[scan.issue] : null
  const meta = [
    Number.isFinite(scan.durationMs) ? formatDuration(scan.durationMs) : '',
    scan.frames > 0 ? `${scan.frames} khung` : 'chưa có khung nào',
    deviceLabel(scan),
  ].filter(Boolean).join(' · ')
  // Rõ mặt mà không khớp: máy thấy giống ai nhất? Trùng người tự gõ tên mà
  // "suýt khớp" nghĩa là ảnh hồ sơ cần bổ sung; khác người là máy đang lẫn
  const best = scan.best?.candidate && scan.issue === 'no_match'
    ? `giống nhất: ${scan.best.candidate.name} ${formatScore(scan.best.score)}${isNearMiss(scan.best, tau) ? ' — suýt khớp' : ''}`
    : ''
  return (
    <li className={`face-scan is-${outcome.tone}`}>
      <button type="button" className="face-scan__head" aria-expanded={expanded} onClick={onToggle}>
        <span className="face-scan__when">{formatWhen(scan.startedAt)}</span>
        <span className="face-scan__who">
          {who.name ? <b>{who.name}</b> : <b className="is-unknown">Chưa rõ là ai</b>}
          {who.note && <small>{who.note}</small>}
        </span>
        <span className={`face-badge is-${outcome.tone}`}>{outcome.label}</span>
        <span className="face-scan__meta">{meta}</span>
        {issue && (
          <span className="face-scan__issue">
            {issue.label}{best ? ` · ${best}` : ''}
          </span>
        )}
      </button>
      {expanded && <ScanDetail detail={detail} />}
    </li>
  )
}

function FaceHistory() {
  const [summary, setSummary] = useState(null)
  const [list, setList] = useState(EMPTY_LIST)
  const [filter, setFilter] = useState('all')
  const [member, setMember] = useState(null)       // { id, name } — lọc theo một bạn
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(null)
  const [details, setDetails] = useState({})       // id → { key, data | error }
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  // Đánh số lượt load: response cũ về muộn (đổi bộ lọc, tự làm mới) không ghi đè
  const loadSeq = useRef(0)
  const memberId = member?.id ?? null

  const load = useCallback(async ({ silent = false, reset = false } = {}) => {
    const seq = ++loadSeq.current
    if (!silent) setLoading(true)
    try {
      const [summaryData, page] = await Promise.all([
        adminApi.getFaceSummary(),
        adminApi.listFaceScans({ filter, studentId: memberId }),
      ])
      if (seq !== loadSeq.current) return
      const items = page?.items || []
      setSummary(summaryData)
      setList((current) => {
        if (reset) return { items, nextBefore: page?.nextBefore ?? null }
        const merged = mergeScans(items, current.items)
        // Đã tải thêm trang cũ hơn thì giữ con trỏ "Xem thêm" đang có
        return { items: merged, nextBefore: merged.length > items.length ? current.nextBefore : page?.nextBefore ?? null }
      })
      setNow(Date.now())
      setLastRefresh(new Date())
      setError('')
    } catch (err) {
      if (seq === loadSeq.current) setError(err.message)
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [filter, memberId])

  useEffect(() => {
    const initial = setTimeout(() => load({ reset: true }), 0)
    const timer = setInterval(() => load({ silent: true }), AUTO_REFRESH_MS)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [load])

  // Mở một lượt thì tải từng khung của nó; lượt còn đang chạy thì tải lại khi
  // có thêm khung hay có kết quả
  const expandedScan = list.items.find((scan) => scan.id === expanded)
  const expandedKey = expandedScan ? detailKey(expandedScan) : null
  const cachedKey = expanded ? details[expanded]?.key : null
  useEffect(() => {
    if (!expanded || !expandedKey || cachedKey === expandedKey) return undefined
    let cancelled = false
    adminApi.getFaceScan(expanded)
      .then((data) => {
        if (!cancelled) setDetails((current) => ({ ...current, [expanded]: { key: expandedKey, data } }))
      })
      .catch((err) => {
        if (!cancelled) setDetails((current) => ({ ...current, [expanded]: { key: expandedKey, error: err.message } }))
      })
    return () => { cancelled = true }
  }, [expanded, expandedKey, cachedKey])

  const loadMore = async () => {
    if (!list.nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await adminApi.listFaceScans({ filter, studentId: memberId, before: list.nextBefore })
      setList((current) => {
        const seen = new Set(current.items.map((scan) => scan.id))
        return {
          items: [...current.items, ...(page?.items || []).filter((scan) => !seen.has(scan.id))],
          nextBefore: page?.nextBefore ?? null,
        }
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  const pickFilter = (value) => {
    setExpanded(null)
    setFilter(value)
  }

  const pickMember = (next) => {
    setExpanded(null)
    setMember((current) => (current?.id === next?.id ? null : next))
  }

  const closeClear = () => setConfirmClear(false)
  const clearDialogRef = useDialogA11y(confirmClear, closeClear)

  const clearAll = async () => {
    setClearing(true)
    setMessage('')
    setError('')
    try {
      const result = await adminApi.clearFaceHistory()
      setConfirmClear(false)
      setExpanded(null)
      setDetails({})
      setMessage(`Đã xoá ${result?.scans ?? 0} lượt quét.`)
      await load({ reset: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setClearing(false)
    }
  }

  const ready = summary?.ready !== false
  const totals = summary?.totals
  const members = summary?.members || []
  const withProfile = members.filter((item) => item.hasProfile).length
  const tau = summary?.thresholds?.tau ?? 0.45
  const issues = Object.entries(summary?.issues || {}).sort((a, b) => b[1] - a[1])
  const maxIssue = issues[0]?.[1] || 1

  return (
    <section className="face-history">
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">✨ Face ID</p>
          <h2>Lịch sử quét</h2>
        </div>
        <div className="admin-header-actions">
          {lastRefresh && (
            <span className="admin-header-note">
              Cập nhật {lastRefresh.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · tự làm mới 30 s
            </span>
          )}
          <button type="button" className="admin-btn" onClick={() => load()} disabled={loading}>
            {loading ? '⟳ Đang tải…' : '⟳ Làm mới'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={() => setConfirmClear(true)}
            disabled={!totals?.scans}
          >
            Xoá lịch sử
          </button>
        </div>
      </header>
      <p className="admin-hint">
        Mỗi lượt là một lần mở camera. Chỉ có kết quả và con số của từng khung hình (sáng, cỡ mặt, độ nét,
        điểm khớp) — không có ảnh hay video nào được lưu.
      </p>

      {message && <p key={message} className="admin-alert success" role="status">{message}</p>}
      {error && <p key={error} className="admin-alert error" role="alert">{error}</p>}

      {!ready ? (
        <div className="admin-empty">
          Chưa có bảng lịch sử Face ID — chạy <code>npm run migrate</code> trong thư mục 20-10be rồi tải lại trang.
        </div>
      ) : (
        <>
          <div className="dash-stats">
            <StatCard value={totals?.scans} label="Lượt quét" />
            <StatCard value={totals?.confirmed} label="Nhận đúng" tone="moss" />
            <StatCard value={totals?.denied} label="Nhầm người" tone={totals?.denied ? 'clay' : ''} />
            <StatCard value={totals?.failed} label="Chưa thành" tone="line" />
            <StatCard value={summary ? formatDuration(summary.medianConfirmMs) : null} label="Nhận ra trong (trung vị)" />
            <StatCard value={summary ? `${withProfile}/${members.length}` : null} label="Bạn đã có hồ sơ Face ID" tone={withProfile < members.length ? 'clay' : 'moss'} />
          </div>

          <div className="dash-grid">
            <section className="admin-card" aria-labelledby="face-scans-title">
              <div className="admin-card__head">
                <h3 id="face-scans-title">Các lượt quét</h3>
                <div className="admin-tabs admin-tabs--sm" role="group" aria-label="Lọc theo kết quả">
                  {FILTERS.map(([value, label]) => (
                    <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => pickFilter(value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {member && (
                <p className="face-filter-note">
                  Chỉ các lượt của <b>{member.name}</b>
                  <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => pickMember(null)}>Bỏ lọc ×</button>
                </p>
              )}
              {loading && !summary ? (
                <p className="admin-loading" style={{ padding: '16px 20px' }}>Đang tải…</p>
              ) : list.items.length === 0 ? (
                <p className="admin-loading" style={{ padding: '18px 20px', margin: 0 }}>
                  {totals?.scans ? 'Không có lượt nào khớp bộ lọc.' : 'Chưa có lượt quét nào — mở trang chủ, chọn "thành viên trong lớp" rồi bấm ✨ Face ID để thử.'}
                </p>
              ) : (
                <ul className="face-scans">
                  {list.items.map((scan) => (
                    <ScanRow
                      key={scan.id}
                      scan={scan}
                      now={now}
                      tau={tau}
                      expanded={expanded === scan.id}
                      onToggle={() => setExpanded((current) => (current === scan.id ? null : scan.id))}
                      detail={details[scan.id]}
                    />
                  ))}
                </ul>
              )}
              {list.nextBefore && (
                <button type="button" className="admin-card__link face-more" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Đang tải…' : 'Xem các lượt cũ hơn →'}
                </button>
              )}
            </section>

            <div className="dash-side">
              <section className="admin-card admin-card--pad" aria-labelledby="face-issues-title">
                <h3 id="face-issues-title">Vì sao chưa nhận ra</h3>
                {issues.length === 0 ? (
                  <p className="admin-hint" style={{ margin: 0 }}>Chưa có lượt nào hỏng 🎉</p>
                ) : (
                  <ul className="face-issues">
                    {issues.map(([key, count]) => (
                      <li key={key} className="face-issue">
                        <div className="face-issue__row">
                          <span>{ISSUES[key]?.label || key}</span>
                          <b>{count}</b>
                        </div>
                        <div className="dash-bar__track">
                          <div className="dash-bar__fill" style={{ width: `${Math.round((count / maxIssue) * 100)}%` }} />
                        </div>
                        {ISSUES[key]?.tip && <small>{ISSUES[key].tip}</small>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="admin-card admin-card--pad" aria-labelledby="face-members-title">
                <h3 id="face-members-title">Theo thành viên</h3>
                <p className="admin-hint">✓ máy nhận đúng · ✗ phải gõ tên · ⇄ máy nhận nhầm người khác thành bạn này. Bấm tên để lọc.</p>
                <ul className="face-members">
                  {sortMembers(members).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`face-member${memberId === item.id ? ' is-active' : ''}`}
                        aria-pressed={memberId === item.id}
                        onClick={() => pickMember({ id: item.id, name: item.name })}
                      >
                        <span className={`stu-avatar face-member__avatar${item.avatarUrl ? '' : ' stu-avatar--noimg'}`} aria-hidden="true">
                          {item.avatarUrl ? <img src={cld(item.avatarUrl, CLD_TINY)} alt="" /> : item.name.charAt(0)}
                        </span>
                        <span className="face-member__text">
                          <b>{item.name}</b>
                          <small className={item.hasProfile ? undefined : 'is-clay'}>
                            {!item.hasProfile
                              ? 'chưa có hồ sơ Face ID'
                              : item.lastAt
                                ? `lần cuối ${formatWhen(item.lastAt)}${item.lastIssue ? ` · ${ISSUES[item.lastIssue]?.label || item.lastIssue}` : ''}`
                                : 'chưa quét lần nào'}
                          </small>
                        </span>
                        <span className="face-member__nums">
                          <span className="is-ok" title="Máy nhận đúng">✓ {item.confirmed}</span>
                          <span className={item.failed ? 'is-warn' : undefined} title="Phải gõ tên sau khi quét">✗ {item.failed}</span>
                          {item.mistakenFor > 0 && <span className="is-bad" title="Máy nhận nhầm người khác thành bạn này">⇄ {item.mistakenFor}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </>
      )}

      {confirmClear && (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeClear}>
          <section ref={clearDialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="clear-face-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="clear-face-title">Xoá lịch sử Face ID</h3>
            <p>
              Xoá cả {totals?.scans ?? 0} lượt quét cùng con số của từng khung hình. Hồ sơ Face ID của các bạn vẫn
              giữ nguyên. Nên xoá các lượt chạy thử trước ngày 20/10.
            </p>
            <div className="admin-form-actions">
              <button type="button" className="admin-btn admin-btn--primary" onClick={clearAll} disabled={clearing}>
                {clearing ? 'Đang xoá…' : 'Xoá lịch sử'}
              </button>
              <button type="button" className="admin-btn" onClick={closeClear}>Hủy</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default FaceHistory
