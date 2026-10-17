-- Migration 024: admin tự viết lời chúc "tự động"
-- greeting_custom để trống thì máy viết ✨ lời chúc mỗi lần trang quà mở như
-- trước; có chữ thì trang quà và bản lưu dùng đúng câu admin viết, máy thôi viết.
ALTER TABLE students
  ADD COLUMN greeting_custom TEXT NULL AFTER admin_wish_image_public_id;
