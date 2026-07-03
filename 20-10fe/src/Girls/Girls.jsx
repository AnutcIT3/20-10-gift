import { useMemo, useState } from 'react'
import dataBanNu from '../Data/BanNu'
import logoclass from '../assets/logoclass.jpg'
import confetti from 'canvas-confetti' 
import './GirlsStyle.css'

const normalizeName = (value) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')

function Girls() {
  const [name, setName] = useState('')
  const [searchedName, setSearchedName] = useState('')

  const girl = useMemo(() => {
    const keyword = normalizeName(searchedName)

    if (!keyword) {
      return null
    }

    return dataBanNu.find((item) => normalizeName(item.hoVaTen) === keyword)
  }, [searchedName])

  const hasSearched = searchedName.trim().length > 0

  const fireConfetti = () => {
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 },
        colors: ['#ff69b4', '#ff1493', '#ffc0cb', '#ffb6c1'] 
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 },
        colors: ['#ff69b4', '#ff1493', '#ffc0cb', '#ffb6c1']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setSearchedName(name)

    const keyword = normalizeName(name)
    const isFound = dataBanNu.some((item) => normalizeName(item.hoVaTen) === keyword)
    
    if (isFound) {
      fireConfetti()
    }
  }

  return (
    <main className="girls-page">
      {/* 1. NẾU CHƯA TÌM THẤY BẠN NỮ THÌ HIỆN Ô NHẬP, TÌM THẤY RỒI SẼ ẨN ĐI */}
      {!girl && (
        <section className="girls-search animated-fade">
          <p className="girls-eyebrow">20/10</p>
          <h1>Lời chúc dành cho bạn nữ</h1>
          <form className="girls-form" onSubmit={handleSubmit}>
            <label htmlFor="girl-name">Nhập tên bạn nữ</label>
            <div className="girls-form-row">
              <input
                id="girl-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ví dụ: Nguyễn Thị A"
              />
              <button type="submit">Enter</button>
            </div>
          </form>
        </section>
      )}

      {/* 2. THAY ĐỔI LỚN: Thêm class 'girls-result-large' để tăng kích thước toàn màn hình */}
{girl && (
  <section className="girl-result-split animated-card" aria-live="polite">
    
    {/* NỬA BÊN TRÁI: Hình ảnh phóng to chiếm trọn không gian bên trái */}
    <div className="split-image-side">
      <img
        src={girl.hinhAnh}
        alt={girl.hoVaTen}
        className="split-bg-image"
        onError={(event) => {
          event.currentTarget.src = logoclass
        }}
      />
    </div>

    {/* NỬA BÊN PHẢI: Lời chúc tự do trên nền tối của ứng dụng */}
    <div className="split-content-side">
      <p className="girl-label">Admin gửi tới</p>
      <h2>{girl.hoVaTen}</h2>
      <p className="girl-text-content">{girl.loiChucCuaAdmin}</p>
      
      <button 
        type="button" 
        className="search-again-btn-split" 
        onClick={() => { setName(''); setSearchedName(''); }}
      >
        Tìm tên khác 💖
      </button>
    </div>

  </section>
)}

      {!girl && hasSearched && (
        <p className="girl-empty animated-fade" aria-live="polite">
          Chúc bạn "{searchedName}" một ngày 20-10 vui vẻ. 💖
        </p>
      )}
    </main>
  )
}

export default Girls