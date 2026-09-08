// Nhãn chỗ ngồi kiểu "bàn 3 · dãy phải" từ seat_row / seat_col (cột 1–4 dãy trái, 5–8 dãy phải)
export function seatLabel(seatRow, seatCol) {
  const row = Number(seatRow)
  const column = Number(seatCol)
  if (row === 0 && column === 9) return 'góc trên phải'
  if (!Number.isInteger(row) || row < 1 || !Number.isInteger(column) || column < 1) return ''
  return `bàn ${row} · dãy ${column <= 4 ? 'trái' : 'phải'}`
}
