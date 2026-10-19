-- Migration 026: lời chúc riêng và 💌 lời chúc từ admin được tới 4 lời mỗi bạn
-- Lời THỨ NHẤT vẫn ở chỗ cũ (students.intro_message / admin_wish, ảnh ở
-- wish_images) để trang Học sinh, bản lưu và code cũ không đổi gì. Bảng này chỉ
-- giữ các lời THÊM (tối đa 3), mỗi lời kèm tối đa 4 ảnh ở wish_note_images.
CREATE TABLE IF NOT EXISTS wish_notes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  kind ENUM('intro', 'admin_wish') NOT NULL,
  content TEXT NULL,
  position TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wish_notes_student (student_id, kind, position),
  CONSTRAINT fk_wish_notes_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wish_note_images (
  id INT PRIMARY KEY AUTO_INCREMENT,
  note_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  public_id VARCHAR(200) NULL,
  position TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wish_note_images_note (note_id, position),
  INDEX idx_wish_note_images_public (public_id),
  CONSTRAINT fk_wish_note_images_note FOREIGN KEY (note_id) REFERENCES wish_notes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
