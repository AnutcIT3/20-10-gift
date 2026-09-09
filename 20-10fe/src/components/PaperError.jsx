import { Link } from 'react-router-dom'
import Polaroid from './paper/Polaroid'
import Postmark from './paper/Postmark'

// Màn lỗi / không tìm thấy: polaroid rơi mất ảnh + dấu bưu điện (2d)
function PaperError({
  title,
  message,
  stamp = ['KHÔNG', 'TÌM', { big: 'THẤY' }],
  onRetry,
  homeLabel = 'Về trang chủ',
}) {
  return (
    <main className="paper-error page-paper">
      <div className="paper-error__card">
        <Polaroid rotate={-4} tapeRotate={3} caption="ảnh bị rơi mất rồi…" className="paper-error__polaroid">
          <Postmark lines={stamp} size={78} rotate={12} bg className="paper-error__postmark" />
        </Polaroid>
        <h1>{title}</h1>
        <p className="paper-error__text" role="alert">{message}</p>
        <div className="paper-error__actions">
          {onRetry && <button type="button" className="btn-dashed" onClick={onRetry}>Thử lại</button>}
          <Link to="/" className="btn-ink">{homeLabel}</Link>
        </div>
      </div>
    </main>
  )
}

export default PaperError
