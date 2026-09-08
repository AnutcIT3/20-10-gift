import PaperError from '../components/PaperError'
import '../styles/gift.css'

function NotFoundPage() {
  return (
    <PaperError
      title="Không tìm thấy trang này"
      message="Đường dẫn này không còn tồn tại hoặc đã được chuyển đi. Bạn có thể quay về trang chủ để tìm tên và mở món quà của mình."
    />
  )
}

export default NotFoundPage
