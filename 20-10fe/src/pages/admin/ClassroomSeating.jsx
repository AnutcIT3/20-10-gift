import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../api/adminApi'

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

function seatLabel(student) {
  if (!hasValidSeat(student)) return 'Chưa có vị trí'
  if (isSpecialSeat(student)) return 'Góc trên phải'
  return `Hàng ${student.seat_row}, cột ${student.seat_col}`
}

function studentInitial(student) {
  return (student.nickname || student.full_name || '?').trim().charAt(0).toUpperCase()
}

function SeatChangeModal({ action, saving, onConfirm, onCancel }) {
  if (!action) return null
  const isClear = action.type === 'clear'
  const targetStudent = action.occupants?.[0]
  const sourceHasSeat = hasValidSeat(action.student)
  let message = `Xóa vị trí hiện tại của ${action.student.full_name}?`
  let confirmLabel = 'Xóa vị trí'

  if (!isClear && targetStudent) {
    message = sourceHasSeat
      ? `Đổi chỗ ${action.student.full_name} và ${targetStudent.full_name}?`
      : `Xếp ${action.student.full_name} vào ghế này và xóa vị trí của ${targetStudent.full_name}?`
    confirmLabel = sourceHasSeat ? 'Đổi chỗ' : 'Xếp vào ghế'
  }

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onCancel}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="seat-change-title" onClick={(event) => event.stopPropagation()}>
        <h3 id="seat-change-title">{isClear ? 'Xóa vị trí' : 'Xác nhận vị trí'}</h3>
        <p>{message}</p>
        <div className="admin-form-actions">
          <button type="button" className={isClear ? 'admin-danger-primary' : 'admin-primary'} disabled={saving} onClick={onConfirm}>
            {saving ? 'Đang lưu...' : confirmLabel}
          </button>
          <button type="button" disabled={saving} onClick={onCancel}>Hủy</button>
        </div>
      </section>
    </div>
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
          setStudents(data)
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
    () => [...students].sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi')),
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

  const seats = Array.from({ length: ROW_COUNT }, (_, rowIndex) => {
    const row = rowIndex + 1
    return Array.from({ length: COLUMN_COUNT }, (_, columnIndex) => {
      const column = columnIndex + 1
      const occupants = seating.bySeat.get(`${row}-${column}`) || []
      const primaryStudent = occupants[0]
      const isConflict = occupants.length > 1
      const isInactive = primaryStudent && !primaryStudent.is_active
      const isSelected = Boolean(primaryStudent && selectedStudent
        && primaryStudent.id === selectedStudent.id)
      const title = occupants.length
        ? occupants.map((student) => `${student.full_name} (${student.class_name || 'Chưa có lớp'})`).join(', ')
        : `Ghế hàng ${row}, cột ${column}`

      return (
        <button
          type="button"
          key={`${row}-${column}`}
          className={`admin-seat ${primaryStudent ? 'occupied' : 'empty'}${isInactive ? ' inactive' : ''}${isConflict ? ' conflict' : ''}${isSelected ? ' selected' : ''}`}
          style={{ gridRow: row, gridColumn: column + (column > 4 ? 1 : 0) }}
          title={title}
          aria-label={title}
          disabled={saving}
          onClick={() => chooseSeat(row, column, occupants)}
        >
          <span className="admin-seat-number">{row}.{column}</span>
          {primaryStudent ? (
            <>
              <span className="admin-seat-avatar" aria-hidden="true">
                {primaryStudent.avatar_url
                  ? <img src={primaryStudent.avatar_url} alt="" />
                  : studentInitial(primaryStudent)}
              </span>
              <strong>{primaryStudent.full_name}</strong>
              {isConflict && <small>{occupants.length} thành viên</small>}
            </>
          ) : <span className="admin-seat-empty-label">Trống</span>}
        </button>
      )
    })
  }).flat()

  const specialOccupants = seating.bySeat.get(`${SPECIAL_SEAT.row}-${SPECIAL_SEAT.column}`) || []
  const specialStudent = specialOccupants[0]
  const specialIsConflict = specialOccupants.length > 1
  const specialIsSelected = Boolean(specialStudent && selectedStudent
    && specialStudent.id === selectedStudent.id)
  const specialTitle = specialStudent
    ? `${specialStudent.full_name} (${specialStudent.class_name || 'Chưa có lớp'})`
    : 'Ghế góc trên phải'

  return (
    <section>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Vị trí</p>
          <h2>Sơ đồ lớp</h2>
        </div>
        <div className="admin-seat-summary" aria-label="Thống kê sơ đồ lớp">
          <span><strong>{seating.occupiedSeats}</strong> ghế đã xếp</span>
          <span><strong>{seating.unseated.length}</strong> chưa có ghế</span>
          {seating.conflicts > 0 && <span className="conflict"><strong>{seating.conflicts}</strong> ghế trùng</span>}
        </div>
      </header>

      {!loading && (
        <div className="admin-seat-controls">
          <label>
            Thành viên
            <select disabled={saving} value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
              <option value="">Chọn thành viên</option>
              {sortedStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} - {seatLabel(student)}
                </option>
              ))}
            </select>
          </label>
          {selectedStudent && (
            <div className="admin-seat-selection">
              <span className="admin-seat-avatar" aria-hidden="true">{studentInitial(selectedStudent)}</span>
              <span>
                <strong>{selectedStudent.full_name}</strong>
                <small>{seatLabel(selectedStudent)}</small>
              </span>
              <button
                type="button"
                className="danger"
                disabled={saving || !hasValidSeat(selectedStudent)}
                onClick={() => setPendingAction({ type: 'clear', student: selectedStudent })}
              >
                Xóa vị trí
              </button>
            </div>
          )}
        </div>
      )}

      {message && <p className="admin-alert success" role="status">{message}</p>}
      {error && <p className="admin-alert error" role="alert">{error}</p>}
      {loading ? <p className="admin-seat-loading">Đang tải sơ đồ...</p> : (
        <>
          <div className="admin-seat-map-wrap">
            <div className="admin-classroom-front">
              <span className="admin-classroom-board">Bảng lớp</span>
              <button
                type="button"
                className={`admin-seat admin-special-seat ${specialStudent ? 'occupied' : 'empty'}${specialStudent && !specialStudent.is_active ? ' inactive' : ''}${specialIsConflict ? ' conflict' : ''}${specialIsSelected ? ' selected' : ''}`}
                title={specialTitle}
                aria-label={specialTitle}
                disabled={saving}
                onClick={() => chooseSeat(SPECIAL_SEAT.row, SPECIAL_SEAT.column, specialOccupants)}
              >
                <span className="admin-seat-number">Góc phải</span>
                {specialStudent ? (
                  <>
                    <span className="admin-seat-avatar" aria-hidden="true">
                      {specialStudent.avatar_url
                        ? <img src={specialStudent.avatar_url} alt="" />
                        : studentInitial(specialStudent)}
                    </span>
                    <strong>{specialStudent.full_name}</strong>
                    {specialIsConflict && <small>{specialOccupants.length} thành viên</small>}
                  </>
                ) : <span className="admin-seat-empty-label">Trống</span>}
              </button>
            </div>
            <div className="admin-seat-map" aria-label="Sơ đồ lớp gồm 6 hàng và 8 cột">
              <div className="admin-classroom-aisle" aria-hidden="true"><span>Lối đi</span></div>
              {seats}
            </div>
            <div className="admin-seat-legend" aria-label="Chú thích">
              <span><i className="occupied" />Đang hoạt động</span>
              <span><i className="inactive" />Đã tắt</span>
              <span><i className="empty" />Ghế trống</span>
              <span><i className="selected" />Đang chọn</span>
              {seating.conflicts > 0 && <span><i className="conflict" />Trùng vị trí</span>}
            </div>
          </div>

          {seating.unseated.length > 0 && (
            <section className="admin-unseated" aria-labelledby="unseated-title">
              <h3 id="unseated-title">Chưa có vị trí</h3>
              <div className="admin-unseated-list">
                {seating.unseated.map((student) => (
                  <button
                    type="button"
                    key={student.id}
                    className={`admin-unseated-person${student.id === selectedStudent?.id ? ' selected' : ''}`}
                    disabled={saving}
                    onClick={() => setSelectedStudentId(String(student.id))}
                  >
                    <span className="admin-seat-avatar" aria-hidden="true">
                      {student.avatar_url
                        ? <img src={student.avatar_url} alt="" />
                        : studentInitial(student)}
                    </span>
                    <span><strong>{student.full_name}</strong><small>{student.class_name || 'Chưa có lớp'}</small></span>
                    <span className={`admin-badge ${student.is_active ? 'active' : 'inactive'}`}>
                      {student.is_active ? 'Hoạt động' : 'Đã tắt'}
                    </span>
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
