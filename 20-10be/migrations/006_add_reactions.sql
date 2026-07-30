-- Migration 006: Thêm bảng letter_reactions để lưu reaction từ người dùng
CREATE TABLE IF NOT EXISTS letter_reactions (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  letter_id     INT NOT NULL,
  emoji_key     VARCHAR(20) NOT NULL,
  session_id    VARCHAR(64) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- mỗi session chỉ có 1 reaction cho 1 letter
  UNIQUE KEY uq_reaction (letter_id, session_id),
  FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
);
