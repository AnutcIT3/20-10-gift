-- Migration 027: tên gọi khác để tra tên ở trang chủ
-- Vài người được gọi bằng nhiều tên: hồ sơ cô giáo tên "Cô Giáo" nhưng các bạn
-- vẫn gõ "Phượng" hay "Cô Phượng". Các tên cách nhau bằng dấu phẩy; tra tên
-- coi mỗi tên ở đây như họ tên (giữ dấu: "Phượng" khác "Phương").
ALTER TABLE students
  ADD COLUMN search_aliases VARCHAR(255) NULL AFTER nickname;
