-- Migration 022: hồi âm ẩn danh
-- Bạn nữ có thể gửi hồi âm không kèm tên: Hộp thư hồi âm và trang admin chỉ
-- hiện "Ẩn danh". student_id vẫn giữ — trang quà của chính bạn ấy cần nó để
-- hiện lại "cậu đã hồi âm", và xoá hồ sơ thì hồi âm đi theo.
ALTER TABLE letter_replies
  ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE AFTER content;
