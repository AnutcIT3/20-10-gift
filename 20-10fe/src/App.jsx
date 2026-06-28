import { useState, useRef, useEffect } from 'react'
import BoysWish from "./Boy'swish/Boy'swish"
import Girls from './Girls/Girls'
import './App.css'
import musicSrc from './music/Đường Tôi Chở Em Về ⧸ buitruonglinh _ Lyrics Video _ (mp3cut.net).mp3'

function App() {
  const [page, setPage] = useState('home')
  const audioRef = useRef(null)

  // Trình duyệt chặn autoplay, nên thử phát khi người dùng click lần đầu
  useEffect(() => {
    const tryPlay = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => { })
      }
      document.removeEventListener('click', tryPlay)
    }
    document.addEventListener('click', tryPlay)
    // Thử phát ngay (sẽ hoạt động nếu trình duyệt cho phép)
    if (audioRef.current) {
      audioRef.current.play().catch(() => { })
    }
    return () => document.removeEventListener('click', tryPlay)
  }, [])

  if (page === 'girls') {
    return (
      <>
        <button className="back-button" type="button" onClick={() => setPage('home')}>
          Về trang chính
        </button>
        <Girls />
      </>
    )
  }

  if (page === 'boysWish') {
    return (
      <>
        <button className="back-button" type="button" onClick={() => setPage('home')}>
          Về trang chính
        </button>
        <BoysWish />
      </>
    )
  }

  return (
    <main className="home-page">
      <section className="home-hero">
        <p className="home-eyebrow">20/10</p>
        <h1>Trang lời chúc lớp mình</h1>
        <div className="home-actions">
          <button type="button" onClick={() => setPage('girls')}>
            Xem lời chúc bạn nữ
          </button>
          <button type="button" onClick={() => setPage('boysWish')}>
            Gửi lời chúc
          </button>
          <audio ref={audioRef} loop autoPlay controls>
            <source src={musicSrc} type="audio/mpeg" />
          </audio>
        </div>
      </section>
    </main>
  )
}

export default App