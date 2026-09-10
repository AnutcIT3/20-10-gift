-- Migration 017: hồ sơ Face ID + nhật ký so khớp
-- face_profiles giữ MỘT vector 512 chiều (float32 little-endian, chuẩn hóa L2)
-- cho mỗi bạn theo từng model; face_match_log chỉ ghi con số của mỗi lượt quét
-- để admin xem thống kê — không bao giờ có ảnh hay vector trong đó.
-- Cả hai bảng đều nằm ngoài backup/restore: dữ liệu sinh trắc không lên Git.
CREATE TABLE IF NOT EXISTS face_profiles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  model VARCHAR(32) NOT NULL,
  kind ENUM('enroll', 'learned') NOT NULL DEFAULT 'enroll',
  -- đúng 512 x float32 little-endian = 2048 byte, đã chuẩn hóa L2
  embedding BLOB NOT NULL,
  source_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_face_profiles_student (student_id, model),
  CONSTRAINT chk_face_profiles_embedding CHECK (OCTET_LENGTH(embedding) = 2048),
  CONSTRAINT fk_face_profiles_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chỉ số liệu: quyết định, điểm, chất lượng khung hình và câu trả lời của
-- người dùng — không pixel, không vector
CREATE TABLE IF NOT EXISTS face_match_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NULL,
  -- 'match' | 'reject'
  decision VARCHAR(16) NOT NULL,
  score DECIMAL(5,4) NULL,
  margin DECIMAL(5,4) NULL,
  face_px SMALLINT UNSIGNED NULL,
  brightness SMALLINT UNSIGNED NULL,
  -- NULL = chưa trả lời, 1 = đúng là mình, 0 = không phải
  confirmed TINYINT NULL,
  elapsed_ms SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_face_match_log_created (created_at),
  CONSTRAINT fk_face_match_log_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mặc định TẮT: admin bật công tắc khi face-service đã chạy và đã đăng ký hồ sơ
INSERT INTO app_settings (setting_key, setting_value)
VALUES ('face_enabled', '0')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
