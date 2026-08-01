const ROW_COUNT = 6
const COL_COUNT = 8

function SeatLetterReveal({ student }) {
  if (!student) return null

  const seatRow = Number(student.seat_row || student.seat?.row || 1)
  const seatCol = Number(student.seat_col || student.seat?.col || 1)
  const displayName = student.nickname || student.full_name || 'Ban'
  const seats = Array.from({ length: ROW_COUNT * COL_COUNT }, (_, index) => {
    const row = Math.floor(index / COL_COUNT) + 1
    const col = (index % COL_COUNT) + 1
    const isActive = row === seatRow && col === seatCol

    return (
      <div
        key={`${row}-${col}`}
        className={isActive ? 'seat-map-desk active' : 'seat-map-desk'}
        aria-label={isActive ? `Cho ngoi cua ${displayName}` : `Ban ${row}-${col}`}
      >
        {isActive && <span className="seat-letter" aria-hidden="true">Thu</span>}
      </div>
    )
  })

  return (
    <div className="seat-reveal-backdrop" role="status" aria-live="polite">
      <section className="seat-reveal">
        <div className="seat-board-label">Bang lop</div>
        <div className="seat-map" style={{ 
          display: 'grid', 
          gridTemplateColumns: `repeat(${COL_COUNT}, 1fr)` 
        }}>{seats}</div>
        {/* <p>
          La thu cua <strong>{displayName}</strong> dang mo ra tu cho ngoi
        </p> */}
      </section>
    </div>
  )
}

export default SeatLetterReveal
