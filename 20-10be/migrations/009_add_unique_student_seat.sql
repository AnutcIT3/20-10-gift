ALTER TABLE students
  ADD UNIQUE INDEX uq_students_seat (seat_row, seat_col);
