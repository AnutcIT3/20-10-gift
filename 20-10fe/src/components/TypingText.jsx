import { useEffect, useState } from 'react'

const prefersReducedMotion = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Gõ từng ký tự (40 ms/ký tự) với con trỏ nhấp nháy. Trình đọc màn hình nhận
// nguyên văn qua .sr-only; phần đang gõ ẩn khỏi cây trợ năng.
function TypingText({ text, speed = 40 }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? text.length : 0))

  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    let index = 0
    const timer = setInterval(() => {
      index += 1
      setShown(index)
      if (index >= text.length) clearInterval(timer)
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed])

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        <span className="caret" />
      </span>
    </>
  )
}

export default TypingText
