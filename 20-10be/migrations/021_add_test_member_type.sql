-- Migration 021: tài khoản thử
-- 'test' mở quà được như thành viên lớp (gõ tên, Face ID) để thử trước ngày
-- 20/10, nhưng không tính vào sĩ số: bông hoa 12A1, thẻ Học sinh và Lượt xem
-- ở trang Tổng quan chỉ đếm thành viên thật.
ALTER TABLE students
  MODIFY COLUMN member_type ENUM('class', 'friend', 'test') NOT NULL DEFAULT 'class';
