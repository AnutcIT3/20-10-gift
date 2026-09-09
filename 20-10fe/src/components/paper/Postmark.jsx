import { Fragment } from 'react'
import { CLASS_NAME, EVENT_YEAR } from '../../lib/event'

const DEFAULT_LINES = ['LỚP', CLASS_NAME, { big: '20.10' }, String(EVENT_YEAR)]

// Dấu bưu điện tròn: 3–4 dòng chữ Itim, nghiêng nhẹ; `animate` chạy stampIn
function Postmark({
  lines = DEFAULT_LINES,
  size = 112,
  rotate = -12,
  moss = false,
  animate = false,
  delay,
  bg = false,
  className = '',
  style,
}) {
  const compact = size < 100
  const css = {
    ...style,
    '--size': `${size}px`,
    '--rot': `${rotate}deg`,
    '--pm-font': `${compact ? 12 : 15}px`,
    '--pm-big': `${compact ? 16 : 19}px`,
  }
  if (delay !== undefined) css['--delay'] = `${delay}s`

  const classes = [
    'postmark',
    moss && 'postmark--moss',
    animate && 'postmark--in',
    bg && 'postmark--bg',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} style={css} aria-hidden="true">
      <span>
        {lines.map((line, index) => (
          <Fragment key={index}>
            {index > 0 && <br />}
            {line && typeof line === 'object' && 'big' in line ? <b>{line.big}</b> : line}
          </Fragment>
        ))}
      </span>
    </span>
  )
}

export default Postmark
