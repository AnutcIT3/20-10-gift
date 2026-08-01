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

-- Tắt Safe Update để cập nhật theo tên
SET SQL_SAFE_UPDATES = 0;

-- Cập nhật tọa độ hàng và cột cho từng bạn nữ theo sơ đồ lớp học
UPDATE students SET seat_row = 1, seat_col = 4 WHERE full_name = 'Vũ Huyền';
UPDATE students SET seat_row = 1, seat_col = 8 WHERE full_name = 'Giang';

UPDATE students SET seat_row = 2, seat_col = 3 WHERE full_name = 'Linh Tần';
UPDATE students SET seat_row = 2, seat_col = 4 WHERE full_name = 'Thúy';
UPDATE students SET seat_row = 2, seat_col = 7 WHERE full_name = 'Huyền Anh';
UPDATE students SET seat_row = 2, seat_col = 8 WHERE full_name = 'Phương';

UPDATE students SET seat_row = 3, seat_col = 6 WHERE full_name = 'Dương';
UPDATE students SET seat_row = 3, seat_col = 8 WHERE full_name = 'Ngọc';

UPDATE students SET seat_row = 4, seat_col = 1 WHERE full_name = 'Phương Anh';
UPDATE students SET seat_row = 4, seat_col = 2 WHERE full_name = 'Thanh Huyền';
UPDATE students SET seat_row = 4, seat_col = 3 WHERE full_name = 'Phương Linh';

UPDATE students SET seat_row = 5, seat_col = 2 WHERE full_name = 'My';
UPDATE students SET seat_row = 5, seat_col = 3 WHERE full_name = 'Phượng'; -- Hương/Phượng
UPDATE students SET seat_row = 5, seat_col = 4 WHERE full_name = 'Hùng';
UPDATE students SET seat_row = 5, seat_col = 5 WHERE full_name = 'Ngân';
UPDATE students SET seat_row = 5, seat_col = 6 WHERE full_name = 'Mai Huyền';

UPDATE students SET seat_row = 6, seat_col = 2 WHERE full_name = 'Vân Anh';
UPDATE students SET seat_row = 6, seat_col = 4 WHERE full_name = 'Thủy';

-- Bật lại Safe Update Mode
SET SQL_SAFE_UPDATES = 1;

-- Kiểm tra lại danh sách vị trí sau khi update
SELECT id, full_name, seat_row, seat_col FROM students ORDER BY seat_row, seat_col;