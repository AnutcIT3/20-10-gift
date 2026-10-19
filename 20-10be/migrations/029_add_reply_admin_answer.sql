-- Migration 029: hồi âm gửi admin
-- * admin_answer: admin trả lời một hồi âm gửi admin; hiện dưới hồi âm đó
-- * is_private: hồi âm gửi admin từ nay CÔNG KHAI như hồi âm khác (lên Hộp thư
--   hồi âm). Những lá viết trước đó được hứa là "thư riêng, chỉ admin đọc"
--   nên giữ riêng tư (is_private = 1), không tự công khai.
ALTER TABLE letter_replies
  ADD COLUMN admin_answer TEXT NULL AFTER content,
  ADD COLUMN admin_answer_at TIMESTAMP NULL AFTER admin_answer,
  ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0 AFTER admin_answer_at;

-- id > 0: MySQL safe update mode cần điều kiện trên cột khoá
UPDATE letter_replies SET is_private = 1 WHERE id > 0 AND target = 'admin';
