import { useEffect, useRef, useState } from 'react'
import '../styles/gift-reveal.css'

// ── Confetti engine (no dependencies) ─────────────────────────────────────────
const COLORS = ['#ffb6c1', '#e6e6fa', '#dc8fa7', '#9275bd', '#fff6c0', '#b5ead7']

function randomBetween(a, b) {
  return a + Math.random() * (b - a)
}

function createParticle(cx, cy) {
  const angle = randomBetween(0, Math.PI * 2)
  const speed = randomBetween(4, 12)
  return {
    x: cx,
    y: cy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - randomBetween(4, 8),
    size: randomBetween(6, 14),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: randomBetween(0, Math.PI * 2),
    rotationSpeed: randomBetween(-0.15, 0.15),
    opacity: 1,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    gravity: randomBetween(0.18, 0.32),
  }
}

function drawParticle(ctx, p) {
  ctx.save()
  ctx.globalAlpha = p.opacity
  ctx.fillStyle = p.color
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rotation)
  if (p.shape === 'rect') {
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
  } else {
    ctx.beginPath()
    ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// ── Component ─────────────────────────────────────────────────────────────────
function GiftReveal({ onComplete, recipientName }) {
  const canvasRef = useRef(null)
  const particlesRef = useRef([])
  const rafRef = useRef(null)
  const [phase, setPhase] = useState('enter') // enter → shake → pop → done

  // Phase sequencer
  useEffect(() => {
    const timers = []
    timers.push(setTimeout(() => setPhase('shake'), 600))
    timers.push(setTimeout(() => setPhase('pop'), 1400))
    timers.push(setTimeout(() => setPhase('done'), 2200))
    return () => timers.forEach(clearTimeout)
  }, [])

  // Launch confetti when lid pops
  useEffect(() => {
    if (phase !== 'pop') return
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    particlesRef.current = Array.from({ length: 120 }, () => createParticle(cx, cy))
  }, [phase])

  // Animate confetti
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particlesRef.current = particlesRef.current.filter((p) => p.opacity > 0.05)
      for (const p of particlesRef.current) {
        p.x += p.vx
        p.y += p.vy
        p.vy += p.gravity
        p.vx *= 0.99
        p.rotation += p.rotationSpeed
        p.opacity -= 0.012
        drawParticle(ctx, p)
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // Resize canvas to window
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Call onComplete after done phase finishes fading
  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(onComplete, 700)
    return () => clearTimeout(t)
  }, [phase, onComplete])

  return (
    <div className={`gift-reveal-overlay gift-reveal-${phase}`} aria-live="polite" aria-label="Đang mở quà...">
      <canvas ref={canvasRef} className="gift-reveal-canvas" aria-hidden="true" />

      <div className={`gift-reveal-box-wrap gift-reveal-box-${phase}`}>
        {/* Lid */}
        <div className={`gift-reveal-lid gift-reveal-lid-${phase}`}>
          <div className="gift-reveal-ribbon-h" />
          <div className="gift-reveal-bow">
            <div className="gift-reveal-bow-left" />
            <div className="gift-reveal-bow-right" />
          </div>
        </div>

        {/* Box body */}
        <div className="gift-reveal-body">
          <div className="gift-reveal-ribbon-v" />
          <span className="gift-reveal-stars" aria-hidden="true">✨</span>
        </div>
      </div>

      {phase === 'pop' || phase === 'done' ? (
        <p className="gift-reveal-label" aria-hidden="true">
          {recipientName ? `Dành riêng cho ${recipientName} 🌷` : 'Mở quà nào! 🎁'}
        </p>
      ) : null}
    </div>
  )
}

export default GiftReveal
