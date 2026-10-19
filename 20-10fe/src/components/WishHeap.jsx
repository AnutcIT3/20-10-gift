import { useEffect, useRef } from 'react'
import { FLIGHT_MS, HEAP_CAP, heapShadowWidth, heapSpot, leafFrames } from '../lib/wishHeap'

function noteStyle(spot) {
  return {
    '--x': `${spot.x}px`,
    '--y': `${spot.y}px`,
    '--r': `${spot.r.toFixed(1)}deg`,
    '--s': spot.s.toFixed(2),
    '--c': spot.color,
    '--stamp': spot.stamp,
  }
}

// Một lá thư đang bay như chiếc lá rồi đáp vào chỗ của lá thứ `index`
function FlyingNote({ index, delay, onLanded }) {
  const ref = useRef(null)
  const spot = heapSpot(index)
  useEffect(() => {
    const el = ref.current
    if (!el?.animate) { onLanded(); return undefined }
    const heapTop = el.parentElement.getBoundingClientRect().top
    const drop = Math.max(260, heapTop + 140)   // từ trên mép màn hình xuống
    // Lệch ngang khi bắt đầu rơi — điện thoại hẹp thì lệch ít, không bay ra ngoài màn hình
    const drift = (Math.random() * 2 - 1) * Math.min(160, window.innerWidth * 0.22)
    const animation = el.animate(leafFrames(spot, drop, drift), { duration: FLIGHT_MS, delay, easing: 'linear', fill: 'backwards' })
    animation.onfinish = () => onLanded()
    return () => { animation.onfinish = null; animation.cancel() }
    // Chỉ bay một lần lúc xuất hiện
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <span ref={ref} className={`wish-note wish-note--${spot.face} is-flying`} style={{ ...noteStyle(spot), zIndex: 500 }} />
}

/**
 * Đống thư phủ lên chân phong bì ở trang chủ: `count` lá đã nằm (tối đa 200),
 * `flights` lá đang bay vào. Trang trí thuần tuý — aria-hidden; con số đọc được
 * nằm ở dòng "lời chúc đã được gửi".
 */
function WishHeap({ count, flights = [], onLanded }) {
  const shown = Math.min(count, HEAP_CAP)
  return (
    <div className="wish-heap" aria-hidden="true">
      <span className="wish-heap__shadow" style={{ width: `${heapShadowWidth(shown)}px` }} />
      {Array.from({ length: shown }, (_, i) => {
        const spot = heapSpot(i)
        return <span key={i} className={`wish-note wish-note--${spot.face}`} style={{ ...noteStyle(spot), zIndex: i }} />
      })}
      {flights.map((flight, order) => (
        <FlyingNote
          key={flight.id}
          index={Math.min(count + order, HEAP_CAP - 1)}
          delay={flight.delay}
          onLanded={() => onLanded(flight.id)}
        />
      ))}
    </div>
  )
}

export default WishHeap
