-- Migration 018: lịch sử Face ID theo từng lượt quét
-- Một lượt quét = một lần camera chạy cho tới khi có kết quả. Chỉ ghi kết quả
-- và con số của từng khung hình (sáng/tối, cỡ mặt, độ nét, điểm khớp) để admin
-- biết vì sao máy chưa nhận ra ai đó — KHÔNG ảnh, KHÔNG video, KHÔNG vector.
-- Như face_profiles và face_match_log, bảng này nằm ngoài backup/restore.
CREATE TABLE IF NOT EXISTS face_scans (
  id INT PRIMARY KEY AUTO_INCREMENT,
  -- mã ngẫu nhiên trình duyệt tạo cho lượt quét, gửi kèm mọi khung hình
  token CHAR(32) NOT NULL,
  -- confirmed | denied | unrecognized | timeout | hidden | camera | offline |
  -- limited | closed; NULL = chưa có tín hiệu kết thúc (đang quét hoặc bỏ dở)
  outcome VARCHAR(16) NULL,
  -- Người máy đưa ra hỏi "Có phải cậu là…?", dù được xác nhận hay bị từ chối
  suggested_student_id INT NULL,
  -- Người gõ tên mở quà ngay sau lượt quét chưa thành: tự nhận, không phải máy đoán
  claimed_student_id INT NULL,
  -- ms từ lúc camera chạy tới khi có kết quả, theo đồng hồ trình duyệt
  duration_ms MEDIUMINT UNSIGNED NULL,
  -- số nhịp trình duyệt tự bỏ vì quá tối, không gửi lên máy chủ
  dark_frames SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- loại máy và trình duyệt suy từ User-Agent (iphone/android…, zalo/safari…)
  device VARCHAR(12) NULL,
  browser VARCHAR(12) NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  UNIQUE KEY uq_face_scans_token (token),
  INDEX idx_face_scans_started (started_at),
  CONSTRAINT fk_face_scans_suggested FOREIGN KEY (suggested_student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_face_scans_claimed FOREIGN KEY (claimed_student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mỗi khung hình biết mình thuộc lượt nào, kèm thêm vài con số để chẩn đoán.
-- Khung thuộc một lượt quét được ghi cả khi bị cổng chất lượng chặn, nên
-- decision giờ có thêm no_face | many_faces | low_quality (reason: small |
-- dark | blurry). candidate_id là người điểm cao nhất kể cả khi bị từ chối —
-- chỉ admin thấy, không bao giờ trả về trình duyệt đang quét.
ALTER TABLE face_match_log
  ADD COLUMN scan_id INT NULL AFTER id,
  ADD COLUMN candidate_id INT NULL AFTER student_id,
  ADD COLUMN reason VARCHAR(16) NULL AFTER decision,
  ADD COLUMN faces TINYINT UNSIGNED NULL AFTER margin,
  ADD COLUMN blur SMALLINT UNSIGNED NULL AFTER brightness,
  ADD COLUMN det_score DECIMAL(4,3) NULL AFTER blur,
  -- ms từ lúc camera chạy tới khung hình này
  ADD COLUMN t_ms MEDIUMINT UNSIGNED NULL AFTER elapsed_ms,
  ADD INDEX idx_face_match_log_scan (scan_id),
  ADD CONSTRAINT fk_face_match_log_scan FOREIGN KEY (scan_id) REFERENCES face_scans(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_face_match_log_candidate FOREIGN KEY (candidate_id) REFERENCES students(id) ON DELETE SET NULL;
