import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../api/adminApi'
import useDialogA11y from '../../hooks/useDialogA11y'
import { seatLabel } from '../../lib/seat'

const ROW_COUNT = 6
const COLUMN_COUNT = 8
const SPECIAL_SEAT = { row: 0, column: 9 }

function isSpecialSeat(student) {
  return Number(student.seat_row) === SPECIAL_SEAT.row
    && Number(student.seat_col) === SPECIAL_SEAT.column
}

function hasValidSeat(student) {
  const row = Number(student.seat_row)
  const column = Number(student.seat_col)
  const isClassroomSeat = Number.isInteger(row) && row >= 1 && row <= ROW_COUNT
    && Number.isInteger(column) && column >= 1 && column <= COLUMN_COUNT
  return isClassroomSeat || isSpecialSeat(student)
}

function seatText(student) {
  if (!hasValidSeat(student)) return 'chưa có chỗ ngồi'
  return seatLabel(student.seat_row, student.seat_col)
}

function studentInitial(student) {
  return (student.nickname || student.full_name || '?').trim().charAt(0).toUpperCase()
}

function SeatChangeModal({ action, saving, onConfirm, onCancel }) {
  const dialogRef = useDialogA11y(Boolean(action), onCancel)
  if (!action) return null
  const isClear = action.type === 'clear'
  const targetStudent = action.occupants?.[0]
  const sourceHasSeat = hasValidSeat(action.student)
  let message = `Bỏ chỗ ngồi hiện tại của ${action.student.full_name}?`
  let confirmLabel = 'Bỏ chỗ ngồi'

  if (!isClear && targetStudent) {
    message = sourceHasSeat
      ? `Đổi chỗ ${action.student.full_name} và ${targetStudent.full_name}?`
      : `Xếp ${action.student.full_name} vào bàn này và bỏ chỗ ngồi của ${targetStudent.full_name}?`
    confirmLabel = sourceHasSeat ? 'Đổi chỗ' : 'Xếp vào bàn'
  }

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onCancel}>
      <section ref={dialogRef} className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="seat-change-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="seat-change-title">{isClear ? 'Bỏ chỗ ngồi' : 'Xác nhận vị trí'}</h3>
        <p>{message}</p>
        <div className="admin-form-actions">
          <button type="button" className="admin-btn admin-btn--primary" disabled={saving} onClick={onConfirm}>
            {saving ? 'Đang lưu…' : confirmLabel}
          </button>
          <button type="button" className="admin-btn" disabled={saving} onClick={onCancel}>Hủy</button>
        </div>
      </section>
    </div>
  )
}

function SeatAvatar({ student }) {
  return (
    <span className="seat__avatar" aria-hidden="true">
      {student.avatar_url ? <img src={student.avatar_url} alt="" /> : studentInitial(student)}
    </span>
  )
}

function ClassroomSeating() {
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    adminApi.listStudents()
      .then((data) => {
        if (!cancelled) {
          // Hồ sơ "bạn bè" ngoài lớp không có chỗ ngồi — loại khỏi sơ đồ
          setStudents(data.filter((student) => student.member_type !== 'friend'))
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === selectedStudentId) || null,
    [students, selectedStudentId],
  )

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi')),
    [students],
  )

  const seating = useMemo(() => {
    const bySeat = new Map()
    const unseated = []

    students.forEach((student) => {
      if (!hasValidSeat(student)) {
        unseated.push(student)
        return
      }

      const key = `${Number(student.seat_row)}-${Number(student.seat_col)}`
      const occupants = bySeat.get(key) || []
      occupants.push(student)
      bySeat.set(key, occupants)
    })

    const occupiedSeats = bySeat.size
    const conflicts = [...bySeat.values()].filter((occupants) => occupants.length > 1).length
    return { bySeat, unseated, occupiedSeats, conflicts }
  }, [students])

  const mergeUpdatedStudents = (result) => {
    const updates = [result.student, result.affectedStudent].filter(Boolean)
    setStudents((current) => current.map((student) => (
      updates.find((updated) => updated.id === student.id) || student
    )))
  }

  const saveSeat = async (student, seatRow, seatColumn) => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await adminApi.updateStudentSeat(student.id, seatRow, seatColumn)
      mergeUpdatedStudents(result)
      setPendingAction(null)
      if (result.action === 'swapped') {
        setMessage(`Đã đổi chỗ ${result.student.full_name} và ${result.affectedStudent.full_name}.`)
      } else if (result.action === 'replaced') {
        setMessage(`Đã xếp ${result.student.full_name}; ${result.affectedStudent.full_name} hiện chưa có vị trí.`)
      } else if (result.action === 'cleared') {
        setMessage(`Đã xóa vị trí của ${result.student.full_name}.`)
      } else if (seatRow === SPECIAL_SEAT.row && seatColumn === SPECIAL_SEAT.column) {
        setMessage(`Đã xếp ${result.student.full_name} vào vị trí góc trên phải.`)
      } else {
        setMessage(`Đã xếp ${result.student.full_name} vào hàng ${seatRow}, cột ${seatColumn}.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const chooseSeat = (row, column, occupants) => {
    if (saving) return
    if (!selectedStudent) {
      if (occupants[0]) setSelectedStudentId(String(occupants[0].id))
      return
    }
    if (occupants.some((student) => student.id === selectedStudent.id)) return
    if (occupants.length) {
      setPendingAction({ type: 'move', student: selectedStudent, row, column, occupants })
      return
    }
    saveSeat(selectedStudent, row, column)
  }

  const confirmSeatChange = () => {
    if (!pendingAction) return
    if (pendingAction.type === 'clear') {
      saveSeat(pendingAction.student, null, null)
    } else {
      saveSeat(pendingAction.student, pendingAction.row, pendingAction.column)
    }
  }

  const renderSeat = ({ row, column, occupants, title, className = '' }) => {
    const primaryStudent = occupants[0]
    const isConflict = occupants.length > 1
    const isInactive = primaryStudent && !primaryStudent.is_active
    const isSelected = Boolean(primaryStudent && selectedStudent && primaryStudent.id === selectedStudent.id)
    const classes = [
      'seat',
      primaryStudent ? '' : 'seat--empty',
      isSelected && 'seat--selected',
      isConflict && 'seat--conflict',
      isInactive && 'seat--inactive',
      className,
    ].filter(Boolean).join(' ')
    const note = isConflict
      ? 'trùng bàn — chọn 1'
      : isInactive ? 'tạm ngưng'
        : isSelected ? `đang chọn · ${seatLabel(row, column)}` : null

    return (
      <button
        type="button"
        key={`${row}-${column}`}
        className={classes}
        style={row >= 1 ? { gridRow: row, gridColumn: column + (column > 4 ? 1 : 0) } : undefined}
        title={title}
        aria-label={title}
        disabled={saving}
        onClick={() => chooseSeat(row, column, occupants)}
      >
        {primaryStudent ? (
          <>
            <SeatAvatar student={isConflict ? { full_name: String(occupants.length) } : primaryStudent} />
            {/* Bàn hẹp: hiện tên gọi như thiết kế, tên đầy đủ nằm trong title/aria-label */}
            <b>{isConflict ? occupants.map((student) => student.nickname || student.full_name).join(' · ') : primaryStudent.nickname || primaryStudent.full_name}</b>
            {note && <small>{note}</small>}
          </>
        ) : 'trống'}
      </button>
    )
  }

  const seats = Array.from({ length: ROW_COUNT }, (_, rowIndex) => {
    const row = rowIndex + 1
    return Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => {
      const column = columnIndex + 1
      const occupants = seating.bySeat.get(`${row}-${column}`) || []
      const title = occupants.length
        ? occupants.map((student) => `${student.full_name} (${student.class_name || 'Chưa có lớp'})`).join(', ')
        : `Ghế hàng ${row}, cột ${column}`
      return renderSeat({ row, column, occupants, title })
    })
  }).flat()

  const specialOccupants = seating.bySeat.get(`${SPECIAL_SEAT.row}-${SPECIAL_SEAT.column}`) || []
  const specialTitle = specialOccupants[0]
    ? `${specialOccupants[0].full_name} (${specialOccupants[0].class_name || 'Chưa có lớp'})`
    : 'Ghế góc trên phải'

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Sơ đồ lớp</p>
          <h2>Ai ngồi đâu?</h2>
        </div>
        <div className="seat-summary" aria-label="Thống kê sơ đồ lớp">
          <span><b>{seating.occupiedSeats}</b> ghế đã xếp</span>
          <span><b>{seating.unseated.length}</b> chưa xếp</span>
          {seating.conflicts > 0 && <span className="conflict"><b>{seating.conflicts}</b> trùng bàn</span>}
        </div>
      </header>

      {!loading && (
        <div className="seat-controls">
          <label>
            Học sinh
            <select className="admin-select admin-select--hand" disabled={saving} value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
              <option value="">Chọn học sinh</option>
              {sortedStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} - {seatText(student)}
                </option>
              ))}
            </select>
          </label>
          {selectedStudent ? (
            <div className="seat-selected">
              Đang chọn: <b>{selectedStudent.full_name}</b> · {seatText(selectedStudent)}
              <i>— bấm một bàn trống để {hasValidSeat(selectedStudent) ? 'chuyển' : 'xếp chỗ'}</i>
              <button
                type="button"
                className="admin-btn admin-btn--sm admin-btn--danger push-end"
                disabled={saving || !hasValidSeat(selectedStudent)}
                onClick={() => setPendingAction({ type: 'clear', student: selectedStudent })}
              >
                Bỏ chỗ ngồi
              </button>
            </div>
          ) : (
            <span className="admin-header-note">Chọn một bạn (hoặc bấm vào bàn đã có người) rồi bấm bàn trống để xếp chỗ.</span>
          )}
        </div>
      )}

      {message && <p key={message} className="admin-alert success" role="status">{message}</p>}
      {error && <p key={error} className="admin-alert error" role="alert">{error}</p>}
      {loading ? <p className="admin-loading">Đang tải sơ đồ…</p> : (
        <>
          <div className="seat-map-wrap">
            <div className="seat-front">
              <span />
              <div className="seat-board">BẢNG LỚP</div>
              {renderSeat({
                row: SPECIAL_SEAT.row,
                column: SPECIAL_SEAT.column,
                occupants: specialOccupants,
                title: specialTitle,
                className: 'seat-teacher',
              })}
            </div>
            <div className="seat-map" aria-label="Sơ đồ lớp gồm 6 hàng và 8 cột">
              <div className="seat-aisle" aria-hidden="true"><span>LỐI ĐI</span></div>
              {seats}
            </div>
            <div className="seat-legend" aria-label="Chú thích">
              <span><i /> đã xếp</span>
              <span><i className="empty" /> trống</span>
              <span><i className="conflict" /> trùng bàn</span>
              <span><i className="inactive" /> tạm ngưng</span>
              <span><i className="selected" /> đang chọn</span>
            </div>
          </div>

          {seating.unseated.length > 0 && (
            <section className="admin-card unseated" aria-labelledby="unseated-title">
              <h3 id="unseated-title">Chưa có chỗ ngồi · {seating.unseated.length}</h3>
              <div className="unseated__list">
                {seating.unseated.map((student) => (
                  <button
                    type="button"
                    key={student.id}
                    className={`unseated__chip${student.id === selectedStudent?.id ? ' is-selected' : ''}`}
                    disabled={saving}
                    onClick={() => setSelectedStudentId(String(student.id))}
                  >
                    <SeatAvatar student={student} />
                    {student.full_name}
                    {!student.is_active && <span className="admin-badge inactive">đã tắt</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <SeatChangeModal action={pendingAction} saving={saving} onConfirm={confirmSeatChange} onCancel={() => setPendingAction(null)} />
    </section>
  )
}

export default ClassroomSeating
