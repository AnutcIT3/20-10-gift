-- Migration 019: ba loại lời chúc trên trang quà
-- Trang quà trước đây chỉ có một câu mẫu trong intro_message rồi tới thư của
-- mọi người trộn chung. Nay tách rõ:
--   intro_message  → lời chúc riêng admin viết cho từng bạn (đã có sẵn)
--   admin_wish     → lời chúc thứ hai từ admin, chỉ hiện khi có viết
--   sender_kind    → thư của các bạn nam 12A1 (admin nhập sẵn) tách khỏi thư
--                    của khách ghé thăm (gửi qua form, chờ duyệt)
ALTER TABLE students
  ADD COLUMN admin_wish TEXT NULL DEFAULT NULL AFTER intro_message;

-- Mặc định 'guest' để mọi thư đang có giữ nguyên chỗ cũ trong nhóm khách;
-- thư của các bạn nam được đánh dấu lúc nhập file.
ALTER TABLE letters
  ADD COLUMN sender_kind ENUM('classmate', 'guest') NOT NULL DEFAULT 'guest' AFTER sender_name;

CREATE INDEX idx_letters_student_kind ON letters (student_id, sender_kind);
