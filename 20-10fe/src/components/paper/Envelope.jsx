import Stamp from './Stamp'

/**
 * Phong bì: thân kem + hai cánh + nắp đào + niêm phong sáp "20.10" + tem logo.
 * `open` lật nắp và cho tờ thư trồi lên (trang chủ sau khi chọn vai trò).
 * Trang trí thuần túy — aria-hidden.
 */
function Envelope({
  size = 'sm',
  open = false,
  letterText = 'Gửi ai đây nhỉ?',
  seal = true,
  sealWiggle = false,
  sealAnimate = false,
  sealDelay,
  wiggle = false,
  logo = true,
  logoAnimate = false,
  logoDelay,
  className = '',
  style,
  children,
}) {
  const classes = [
    'envelope',
    size === 'lg' && 'envelope--lg',
    open && 'envelope--open',
    wiggle && 'envelope--wiggle',
    className,
  ].filter(Boolean).join(' ')

  const sealCss = sealDelay !== undefined ? { '--delay': `${sealDelay}s` } : undefined

  return (
    <div className={classes} style={style} aria-hidden="true">
      <div className="envelope__body" />
      {open ? (
        <>
          <div className="envelope__wing envelope__wing--left" />
          <div className="envelope__wing envelope__wing--right" />
          <div className="envelope__flap" />
          <div className="envelope__letter">{letterText}</div>
          <div className="envelope__pocket" />
        </>
      ) : (
        <>
          <div className="envelope__flap" />
          <div className="envelope__wing envelope__wing--left" />
          <div className="envelope__wing envelope__wing--right" />
          {seal && (
            <div
              className={`envelope__seal${sealWiggle ? ' envelope__seal--wiggle' : ''}${sealAnimate ? ' stamp--in' : ''}`}
              style={sealCss}
            >
              20.10
            </div>
          )}
        </>
      )}
      {logo && <Stamp variant="logo" size="sm" className="envelope__logo" animate={logoAnimate} delay={logoDelay} />}
      {children}
    </div>
  )
}

export default Envelope
