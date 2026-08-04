ALTER TABLE students
  ADD CONSTRAINT chk_students_seat_position
  CHECK (
    (seat_row IS NULL AND seat_col IS NULL)
    OR (seat_row BETWEEN 1 AND 6 AND seat_col BETWEEN 1 AND 8)
    OR (seat_row = 0 AND seat_col = 9)
  );
