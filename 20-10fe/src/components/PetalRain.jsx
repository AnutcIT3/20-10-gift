// Mưa cánh hoa đúng khoảnh khắc quà mở lúc 00:00: vài chục cánh rơi lả tả
// khắp màn hình trong vài giây rồi thôi. Trang trí thuần tuý — aria-hidden.
const COLORS = ['#f3c9ad', '#f6dcc8', '#e8a7a0', '#f4b6c2', '#fbe9db', '#c97a5a']

function rand(i, k) {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function PetalRain({ count = 70 }) {
  return (
    <div className="petal-rain" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="petal-rain__petal"
          style={{
            left: `${(rand(i, 1) * 100).toFixed(1)}vw`,
            background: COLORS[i % COLORS.length],
            '--sway': `${Math.round(40 + rand(i, 2) * 80)}px`,
            '--dur': `${(3.2 + rand(i, 3) * 2.6).toFixed(2)}s`,
            '--delay': `${(rand(i, 4) * 1.8).toFixed(2)}s`,
            '--size': `${Math.round(10 + rand(i, 5) * 8)}px`,
          }}
        />
      ))}
    </div>
  )
}

export default PetalRain
