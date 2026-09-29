import { useId } from 'react'

const CENTER = 110
const PETAL_DISTANCE = 56
const PETAL_LENGTH = 34

// Cánh hẹp dần khi lớp đông để các cánh không chồng kín lên nhau
function petalWidth(total) {
  const perPetal = (2 * Math.PI * PETAL_DISTANCE) / Math.max(total, 1)
  return Math.max(6, Math.min(15, perPetal * 0.62))
}

/**
 * Bông hoa 12A1: mỗi thành viên lớp là một cánh, bạn nào mở quà thì cánh đó
 * tô màu (theo chiều kim đồng hồ từ đỉnh). Cánh mới nở chuyển màu bằng
 * transition nên chỉ những thay đổi lúc đang xem mới có chuyển động; mỗi lần
 * số đếm tăng lại có một cánh hoa rơi vào giữa.
 */
function ClassFlower({
  opened = 0, total = 0, compact = false, caption = true, className = '',
}) {
  const gradientId = `flower-heart-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (!total) return null
  const filled = Math.max(0, Math.min(opened, total))
  const complete = filled >= total
  const rx = petalWidth(total)
  const classes = ['flower', compact && 'flower--compact', complete && 'is-complete', className]
    .filter(Boolean).join(' ')

  return (
    <figure className={classes}>
      <div className="flower__art">
        <svg viewBox="0 0 220 220" role="img" aria-label={`${filled} trên ${total} bạn đã mở quà`}>
          <defs>
            <radialGradient id={gradientId} cx="35%" cy="35%" r="75%">
              <stop offset="0%" stopColor="#c97a5a" />
              <stop offset="60%" stopColor="#a85f3f" />
              <stop offset="100%" stopColor="#7d4229" />
            </radialGradient>
          </defs>
          {Array.from({ length: total }, (_, index) => (
            <g key={index} transform={`rotate(${(360 / total) * index} ${CENTER} ${CENTER})`}>
              <ellipse
                className={`flower__petal${index < filled ? ' is-open' : ''}`}
                cx={CENTER}
                cy={CENTER - PETAL_DISTANCE}
                rx={rx}
                ry={PETAL_LENGTH}
              />
            </g>
          ))}
          <circle cx={CENTER} cy={CENTER} r="30" fill={`url(#${gradientId})`} />
          <text className="flower__count" x={CENTER} y={CENTER + 9} textAnchor="middle">{filled}</text>
        </svg>
        {/* key đổi theo số đếm → phần tử mới, animation rơi chạy lại mỗi lần tăng */}
        {filled > 0 && <span key={filled} className="flower__drop" aria-hidden="true" />}
      </div>
      {caption && (
        <figcaption className="flower__caption">
          {complete
            ? <>Cả {total} bạn nữ đã mở quà rồi! 🌸</>
            : <><b>{filled}/{total}</b> bạn đã mở quà</>}
        </figcaption>
      )}
    </figure>
  )
}

export default ClassFlower
