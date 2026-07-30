ALTER TABLE students
  ADD COLUMN seat_row INT NULL,
  ADD COLUMN seat_col INT NULL;
SET SQL_SAFE_UPDATES = 0;
UPDATE students 
SET 
  seat_row = FLOOR((id - 1) / 6) + 1,
  seat_col = MOD(id - 1, 6) + 1 
WHERE seat_row IS NULL OR seat_col IS NULL;
SET SQL_SAFE_UPDATES = 1;
