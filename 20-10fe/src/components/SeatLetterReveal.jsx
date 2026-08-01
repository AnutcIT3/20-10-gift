const ROW_COUNT = 6
const DESKS_PER_ROW = 4 // Mỗi dãy có 4 bàn / hàng

// Biểu tượng Bức thư SVG
const EnvelopeIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    className="seat-letter-icon" 
    aria-hidden="true" 
    fill="currentColor"
  >
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
  </svg>
)

function SeatLetterReveal({ student }) {
  if (!student) return null

  const seatRow = Number(student.seat_row || student.seat?.row || 1)
  const seatCol = Number(student.seat_col || student.seat?.col || 1)
  const displayName = student.nickname || student.full_name || 'Ban'

  // Hàm render 1 ô bàn
  const renderDesk = (row, col) => {
    const isActive = row === seatRow && col === seatCol
    return (
      <div
        key={`${row}-${col}`}
        className={isActive ? 'seat-map-desk active' : 'seat-map-desk'}
        aria-label={isActive ? `Cho ngoi cua ${displayName}` : `Ban ${row}-${col}`}
      >
        {isActive && (
          <div className="seat-letter-wrapper">
            <EnvelopeIcon />
          </div>
        )}
      </div>
    )
  }

  // Tạo Dãy Trái (Cột 1 -> 4) và Dãy Phải (Cột 5 -> 8)
  const leftBlock = []
  const rightBlock = []

  for (let r = 1; r <= ROW_COUNT; r++) {
    for (let c = 1; c <= DESKS_PER_ROW; c++) {
      leftBlock.push(renderDesk(r, c))          // Cột 1, 2, 3, 4
      rightBlock.push(renderDesk(r, c + 4))      // Cột 5, 6, 7, 8
    }
  }

  return (
    <div className="seat-reveal-backdrop" role="status" aria-live="polite">
      <style>{`
        .seat-reveal {
          width: min(92vw, 540px) !important;
          background: #ffffff;
          border-radius: 20px;
          padding: 24px 20px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.15);
          box-sizing: border-box;
          margin: 0 auto;
        }

        .seat-board-label {
          text-align: center;
          font-weight: bold;
          margin-bottom: 18px;
          background: #4a3b52;
          color: white;
          padding: 6px 20px;
          border-radius: 12px;
          display: inline-block;
          font-size: 14px;
        }

        /* Khung chứa 2 dãy bàn + Lối đi ở giữa */
        .classroom-container {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          gap: 20px !important; /* Độ rộng lối đi giữa 2 dãy */
          width: 100% !important;
        }

        /* Mỗi dãy bàn là 1 grid 4 cột chuẩn */
        .seat-block {
          display: grid !important;
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 6px !important;
          flex: 1 !important;
        }

        .seat-map-desk {
          width: 100%;
          aspect-ratio: 1 / 1;
          background-color: #f7f5f8;
          border: 1.5px solid #e2dbe5;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          position: relative;
        }

        .seat-map-desk.active {
          background-color: #fff0f3;
          border-color: #ff4d6d;
          box-shadow: 0 0 12px rgba(255, 77, 109, 0.4);
        }

        .seat-letter-wrapper {
          width: 75%;
          height: 75%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .seat-letter-icon {
          width: 100%;
          height: 100%;
          color: #ff4d6d;
          animation: popUp 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }

        @keyframes popUp {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <section className="seat-reveal">
        <div style={{ textAlign: 'center' }}>
          <div className="seat-board-label">Bang lop</div>
        </div>
        
        {/* Lớp học chia làm 2 dãy chuẩn 6 hàng x 4 bàn */}
        <div className="classroom-container">
          <div className="seat-block left">{leftBlock}</div>
          <div className="seat-block right">{rightBlock}</div>
        </div>
      </section>
    </div>
  )
}

export default SeatLetterReveal