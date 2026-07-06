import { Link } from 'react-router-dom'
import '../styles/celebration.css'

function NotFoundPage() {
  return (
    <main className="celebration-page">
      <section className="celebration-card">
        <div className="celebration-flowers">🌷 ✨ 🌸</div>
        <p className="celebration-label">Không tìm thấy trang</p>
        <h1>404</h1>
        <p className="celebration-message">
          Đường dẫn này không còn tồn tại hoặc đã được chuyển đi. Bạn có thể quay về trang chính để tìm tên và mở món quà của mình.
        </p>
        <Link to="/">Về trang chính</Link>
      </section>
    </main>
  )
}

export default NotFoundPage
