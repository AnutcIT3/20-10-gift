import { useState, useRef } from 'react'
import BoysWish from "./Boy'swish/Boy'swish"
import Girls from './Girls/Girls'
import './App.css'
import musicSrc from './music/Đường Tôi Chở Em Về ⧸ buitruonglinh _ Lyrics Video _ (mp3cut.net).mp3'

function App() {
  const [page, setPage] = useState('home')
  const audioRef = useRef(null)

  // Hàm hỗ trợ phát nhạc chủ động
  const handlePlayMusic = () => {
    if (audioRef.current) {
      audioRef.current.play().catch((err) => {
        console.log("Trình duyệt chặn phát nhạc tự động:", err)
      })
    }
  }

  // Hàm tắt nhạc và reset trạng thái bài hát
  const handleStopMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause()        // Tạm dừng nhạc
      audioRef.current.currentTime = 0 // Tua nhạc về giây đầu tiên (nếu muốn bấm lại bài hát chạy từ đầu)
    }
  }

  // Hàm xử lý quay về trang chính
  const handleBackToHome = () => {
    setPage('home')
    handleStopMusic() // Tắt nhạc khi về trang chính
  }

  // Hàm xử lý khi bấm Xem lời chúc bạn nữ
  const handleGoToGirls = () => {
    setPage('girls')
    handlePlayMusic() // Kích hoạt nhạc chạy luôn
  }

  // Hàm xử lý khi bấm Gửi lời chúc
  const handleGoToBoysWish = () => {
    setPage('boysWish')
    handlePlayMusic() 
  }

  // Định nghĩa nội dung hiển thị theo từng trang dựa trên state 'page'
  const renderContent = () => {
    if (page === 'girls') {
      return (
        <>
          {/* Nút về trang chính đã được cập nhật hàm xử lý tắt nhạc */}
          <button className="back-button" type="button" onClick={handleBackToHome}>
            Về trang chính
          </button>
          <Girls />
        </>
      )
    }

    if (page === 'boysWish') {
      return (
        <>
          {/* Nút về trang chính đã được cập nhật hàm xử lý tắt nhạc */}
          <button className="back-button" type="button" onClick={handleBackToHome}>
            Về trang chính
          </button>
          <BoysWish />
        </>
      )
    }

    // Giao diện Trang chủ mặc định
    return (
      <main className="home-page">
        <section className="home-hero">
          <p className="home-eyebrow">20/10</p>
          <h1>Trang lời chúc lớp mình</h1>
          <div className="home-actions">
            <button type="button" onClick={handleGoToGirls}>
              Xem lời chúc bạn nữ
            </button>
            <button type="button" onClick={handleGoToBoysWish}>
              Gửi lời chúc
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <>
      {/* Gọi hàm render nội dung trang */}
      {renderContent()}

      {/* Thẻ audio nằm cố định ở đây để không bị mất dữ liệu khi đổi giao diện */}
      <audio ref={audioRef} loop controls style={{ display: 'none' }}>
        <source src={musicSrc} type="audio/mpeg" />
      </audio>
    </>
  )
}

export default App