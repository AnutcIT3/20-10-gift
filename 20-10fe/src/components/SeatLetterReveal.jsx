import { CLASS_NAME } from '../lib/event'
import '../styles/seatletter.css'

const ROW_COUNT = 6
const DESKS_PER_ROW = 4 // Mỗi dãy 4 bàn/hàng

// Phong bì mini nhô lên từ bàn của học sinh — GiftReveal đo vị trí phần tử
// này (data-active-letter) để cho phong bì lớn bay ra từ đúng chỗ
function MiniLetter() {
  return (
    <span className="seat-letter" data-active-letter="" aria-hidden="true">
      <span className="seat-letter__flap" />
    </span>
  )
}

/**
 * Sơ đồ lớp trong lúc mở quà (2b). Không tự vẽ backdrop — GiftReveal đặt nó
 * trong overlay của mình; `leaving` làm sơ đồ mờ dần khi thư bắt đầu bay.
 */
function SeatLetterReveal({ student, leaving = false }) {
  if (!student) return null

  const seatRow = Number(student.seat_row ?? student.seat?.row ?? 1)
  const seatCol = Number(student.seat_col ?? student.seat?.col ?? 1)
  const isSpecialSeat = seatRow === 0 && seatCol === 9
  const displayName = student.nickname || student.full_name || 'bạn'

  const renderDesk = (row, col) => {
    const isActive = row === seatRow && col === seatCol
    return (
      <div
        key={`${row}-${col}`}
        className={`seat-desk${isActive ? ' is-active' : ''}`}
        data-active-desk={isActive ? '' : undefined}
        aria-label={isActive ? `Chỗ ngồi của ${displayName}` : `Bàn ${row}-${col}`}
      >
        {isActive && <MiniLetter />}
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
    <section className={`seat-reveal${leaving ? ' is-leaving' : ''}`}>
      <div className="seat-reveal__top">
        <span className="seat-reveal__class">Lớp {CLASS_NAME}</span>
        <div className="seat-reveal__board">BẢNG</div>
        <div
          className={`seat-desk seat-desk--teacher${isSpecialSeat ? ' is-active' : ''}`}
          data-active-desk={isSpecialSeat ? '' : undefined}
          aria-label={isSpecialSeat ? `Chỗ ngồi của ${displayName}` : 'Bàn góc trên phải'}
        >
          {isSpecialSeat && <MiniLetter />}
        </div>
      </div>

      <div className="seat-reveal__room">
        <div className="seat-reveal__block">{leftBlock}</div>
        <div className="seat-reveal__aisle" aria-hidden="true" />
        <div className="seat-reveal__block">{rightBlock}</div>
      </div>

      <p className="seat-reveal__caption">Có thư gửi tới bàn của {displayName}… ✉</p>
    </section>
  )
}

export default SeatLetterReveal
