import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dataBanNu from '../Data/BanNu'; // Đường dẫn tới file data của bạn
import logoclass from '../assets/logoclass.jpg';
import './GiftPage.css';

function TypingTextAnimation({ text, speed }) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let index = 0;
    if (!text) return undefined;

    const timer = setInterval(() => {
        setDisplayedText((prev) => prev + text.charAt(index));
        index++;
        if (index >= text.length) {
          clearInterval(timer);
        }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  return <span className="typing-cursor">{displayedText}</span>;
}

// Remount animation khi nội dung đổi để trạng thái bắt đầu lại từ đầu.
function TypingText({ text, speed = 40 }) {
  const safeText = text ? text.normalize('NFC') : '';
  return <TypingTextAnimation key={safeText} text={safeText} speed={speed} />;
}

function GiftPage() {
  const { nameParam } = useParams(); // Lấy tên từ URL (Cần cấu trúc route dạng /gift/:nameParam)
  const navigate = useNavigate();

  // Hàm chuẩn hóa tìm kiếm tên
  const normalizeName = (value) =>
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ');

  // Tìm kiếm bạn nữ trong dataBanNu dựa trên URL parameter
  const girl = useMemo(() => {
    if (!nameParam) return null;
    const keyword = normalizeName(decodeURIComponent(nameParam));
    return dataBanNu.find((item) => normalizeName(item.hoVaTen) === keyword);
  }, [nameParam]);

  const displayName = decodeURIComponent(nameParam || '');

  return (
    <div className="gift-page-container">
      {/* Nút Quản trị góc trên */}
      <button className="admin-btn" onClick={() => navigate('/admin')}>
        ⚙️ Quản trị
      </button>

      {/* Khối Header hiển thị Tên lớn phía trên */}
      <header className="gift-header">
        <div className="avatar-circle">
          {girl && girl.hinhAnh ? (
            <img 
              src={girl.hinhAnh} 
              alt={displayName} 
              onError={(e) => { e.currentTarget.src = logoclass; }}
            />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        <h1 className="girl-name">{girl ? girl.hoVaTen.normalize('NFC') : displayName.normalize('NFC')}</h1>
        <p className="mini-wish">Chúc Vy luôn xinh đẹp và hạnh phúc!</p>
      </header>

      {/* Khối nội dung Lời chúc riêng */}
      <main className="wish-box-card">
        <p className="box-badge">✨ LỜI CHÚC DÀNH RIÊNG CHO BẠN</p>
        
        <p className="wish-text-content">
          {girl ? (
            <TypingText text={girl.loiChucCuaAdmin} speed={40} />
          ) : (
            `Chào ${displayName}, chúc bạn một ngày Phụ nữ Việt Nam 20/10 thật nhiều niềm vui, hạnh phúc và luôn rạng rỡ nhé! 💖`
          )}
        </p>

        {/* NÚT TÌM TÊN KHÁC: Giúp quay trở lại LandingPage để tra cứu người khác */}
        <button className="search-again-btn" onClick={() => navigate('/')}>
          Tìm tên khác 💖
        </button>
      </main>

      {/* Khối Kỷ niệm hình ảnh phía dưới */}
      <section className="memory-section">
        <h2>📷 Kỷ niệm</h2>
        <div className="photo-placeholder">
          <div className="camera-icon">📷</div>
          <p>Chưa có ảnh nào...</p>
        </div>
      </section>

      {/* Nút bật nhạc cố định dưới góc */}
      <button className="music-toggle-btn">
        🎵 Tạm dừng
      </button>
    </div>
  );
}

export default GiftPage;
