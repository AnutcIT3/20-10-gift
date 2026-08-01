import '../styles/seatletter.css' // Import file CSS mới tạo

const ROW_COUNT = 6
const DESKS_PER_ROW = 4 // Mỗi dãy 4 bàn/hàng

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

  const leftBlock = []
  const rightBlock = []

  for (let r = 1; r <= ROW_COUNT; r++) {
    for (let c = 1; c <= DESKS_PER_ROW; c++) {
      leftBlock.push(renderDesk(r, c))       // Cột 1, 2, 3, 4
      rightBlock.push(renderDesk(r, c + 4))   // Cột 5, 6, 7, 8
    }
  }

  return (
    <div className="seat-reveal-backdrop" role="status" aria-live="polite">
      <section className="seat-reveal">
        <div style={{ textAlign: 'center' }}>
          <div className="seat-board-label">Bang lop</div>
        </div>
        
        <div className="classroom-container">
          <div className="seat-block left">{leftBlock}</div>
          <div className="seat-block right">{rightBlock}</div>
        </div>
      </section>
    </div>
  )
}

export default SeatLetterReveal