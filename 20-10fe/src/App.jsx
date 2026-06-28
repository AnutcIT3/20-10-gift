import { useState } from 'react'
import BoysWish from "./Boy'swish/Boy'swish"
import Girls from './Girls/Girls'
import './App.css'

function App() {
  const [page, setPage] = useState('home')

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
          <audio id="myAudio" autoPlay controls>
              <source src="E:\20-10\20-10fe\src\music\Đường Tôi Chở Em Về ⧸ buitruonglinh _ Lyrics Video _ (mp3cut.net).mp3"/>
          </audio>
        </div>
      </section>
    </main>
  )
}

export default App
