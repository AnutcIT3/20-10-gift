-- Migration 025: một lời chúc kèm tới 4 ảnh
-- Khách và admin chọn được nhiều ảnh cùng lúc cho một lá thư; ba lời chúc riêng
-- (lời chúc riêng, 💌 admin, ✨ tự động) cũng vậy. Ảnh nằm ở hai bảng mới, có
-- thứ tự. Cột ảnh cũ (letters.image_url…, students.*_image_url…) vẫn giữ và
-- luôn là ẢNH ĐẦU TIÊN: máy chạy code cũ, snapshot cũ và mọi chỗ còn đọc một ảnh
-- vẫn hiện được ảnh đầu thay vì hỏng.
CREATE TABLE IF NOT EXISTS letter_images (
  id INT PRIMARY KEY AUTO_INCREMENT,
  letter_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  public_id VARCHAR(200) NULL,
  position TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_letter_images_letter (letter_id, position),
  INDEX idx_letter_images_public (public_id),
  CONSTRAINT fk_letter_images_letter FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wish_images (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  kind ENUM('intro', 'admin_wish', 'greeting') NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  public_id VARCHAR(200) NULL,
  position TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wish_images_student (student_id, kind, position),
  INDEX idx_wish_images_public (public_id),
  CONSTRAINT fk_wish_images_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ảnh đang có thành ảnh đầu tiên (position 0) ở bảng mới
INSERT INTO letter_images (letter_id, image_url, public_id, position)
  SELECT id, image_url, image_public_id, 0 FROM letters WHERE image_url IS NOT NULL;

INSERT INTO wish_images (student_id, kind, image_url, public_id, position)
  SELECT id, 'intro', intro_image_url, intro_image_public_id, 0 FROM students WHERE intro_image_url IS NOT NULL;
INSERT INTO wish_images (student_id, kind, image_url, public_id, position)
  SELECT id, 'admin_wish', admin_wish_image_url, admin_wish_image_public_id, 0 FROM students WHERE admin_wish_image_url IS NOT NULL;
INSERT INTO wish_images (student_id, kind, image_url, public_id, position)
  SELECT id, 'greeting', greeting_image_url, greeting_image_public_id, 0 FROM students WHERE greeting_image_url IS NOT NULL;
