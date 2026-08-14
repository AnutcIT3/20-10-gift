-- Migration 016: hồ sơ "bạn bè" ngoài lớp + ảnh kèm lời chúc
-- member_type phân biệt thành viên lớp và người ngoài được nhận lời chúc;
-- letters nhận thêm một ảnh tùy chọn do người gửi đính kèm.
ALTER TABLE students
  ADD COLUMN member_type ENUM('class', 'friend') NOT NULL DEFAULT 'class';

ALTER TABLE letters
  ADD COLUMN image_url VARCHAR(500) NULL DEFAULT NULL,
  ADD COLUMN image_public_id VARCHAR(255) NULL DEFAULT NULL;
