-- Migration 028: nhóm thư "Từ admin"
-- Thư admin gửi từ trang quản trị hiện thành một nhóm riêng ở đầu mục thư của
-- trang quà, tách khỏi thư các bạn gửi qua form ở trang chủ ("Từ mọi người").
ALTER TABLE letters
  MODIFY COLUMN sender_kind ENUM('classmate', 'guest', 'admin') NOT NULL DEFAULT 'guest';
