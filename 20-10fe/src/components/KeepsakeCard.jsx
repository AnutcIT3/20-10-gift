import { useState } from 'react'
import giftRepository from '../api/giftRepository'
import Stamp from './paper/Stamp'

// Trình duyệt nhúng trong app chat thường không lưu được file tải về
const IN_APP_BROWSER = /Zalo|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|TikTok|musical_ly|Line\//i

function slugify(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Safari cần URL sống thêm một lúc sau click mới bắt đầu tải
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * "Cất quà vào máy": tải bản lưu PDF (ảnh, thư, lời chúc) để vài năm nữa vẫn
 * mở lại được, không cần mạng hay chiếc laptop chạy trang này. Máy chủ không
 * in được PDF thì trả file .html — đuôi file đặt theo thứ thật sự nhận về.
 * Gửi kèm lời chúc AI đang hiện để bản lưu giữ đúng câu cậu đã đọc.
 */
function KeepsakeCard({ accessCode, studentName, greeting }) {
  const [state, setState] = useState({ status: 'idle', message: '' })
  const inApp = typeof navigator !== 'undefined' && IN_APP_BROWSER.test(navigator.userAgent || '')
  const baseName = `qua-20-10-${slugify(studentName) || 'cua-ban'}`

  const download = async () => {
    setState({ status: 'working', message: '' })
    try {
      const blob = await giftRepository.downloadKeepsake(accessCode, greeting)
      const filename = `${baseName}.${blob.type === 'application/pdf' ? 'pdf' : 'html'}`
      saveBlob(blob, filename)
      setState({ status: 'done', message: filename })
    } catch (err) {
      setState({ status: 'error', message: err.message || 'Chưa tải được, thử lại nhé.' })
    }
  }

  const working = state.status === 'working'

  return (
    <section className="gift__section gift__section--last keepsake" aria-labelledby="keepsake-title">
      <div className="keepsake__card letter-paper">
        <Stamp variant="date" rotate={-6} className="keepsake__stamp" />
        <h2 id="keepsake-title" className="keepsake__title">Cất quà vào máy</h2>
        <p className="keepsake__text">
          Cậu có thể tải bản lưu pdf về để lưu giữ làm kỉ niệm nhé, hết hôm nay là chúng ta lại hẹn 1 năm nữa rồi :(
        </p>
        <button type="button" className="btn-stamp btn-stamp--fill keepsake__button" onClick={download} disabled={working} aria-busy={working}>
          {working ? 'Đang gói quà…' : '💾 Tải bản lưu'}
        </button>
        <p className="keepsake__status" role="status" aria-live="polite">
          {working && 'Đang nhét ảnh và thư vào phong bì, chờ mình vài giây nhé…'}
          {state.status === 'done' && <>Xong rồi! File <b>{state.message}</b> nằm trong mục Tải về (Downloads).</>}
        </p>
        {state.status === 'error' && <p className="alert-note keepsake__alert" role="alert">{state.message}</p>}
        {inApp && (
          <p className="keepsake__hint">
            Cậu đang mở trang trong ứng dụng chat — ở đây thường không lưu được file. Bấm <b>⋯</b> rồi chọn
            <b> Mở bằng trình duyệt</b> (Safari/Chrome) và tải lại nhé.
          </p>
        )}
      </div>
    </section>
  )
}

export default KeepsakeCard
