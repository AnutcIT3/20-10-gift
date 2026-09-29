-- Migration 020: thư hồi âm + lượt mở quà
--
-- letter_replies: bạn nữ đọc xong viết lại vài dòng — cho người viết một lá
-- thư (target 'letter'), cho cả lớp ('class') hoặc cho admin ('admin'). Như lời
-- chúc gửi qua form, hồi âm chờ admin duyệt rồi mới hiện ở Hộp thư hồi âm.
-- Xoá lá thư gốc thì hồi âm cho lá thư đó đi theo: không còn ai để gửi tới.
CREATE TABLE IF NOT EXISTS letter_replies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  -- người hồi âm: chủ trang quà
  student_id INT NOT NULL,
  target ENUM('letter', 'class', 'admin') NOT NULL,
  letter_id INT NULL,
  content TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_letter_replies_status (status, created_at),
  INDEX idx_letter_replies_student (student_id),
  CONSTRAINT fk_letter_replies_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_letter_replies_letter FOREIGN KEY (letter_id) REFERENCES letters(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- gift_opens: mỗi lần một bạn mở quà từ trang chủ (gõ tên hoặc Face ID) — nguồn
-- của "bông hoa 12A1" và "cậu là bạn thứ mấy mở quà". Mở thẳng bằng link không
-- tính, để admin kiểm tra trang quà không làm hoa nở thay các bạn.
CREATE TABLE IF NOT EXISTS gift_opens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  via ENUM('name', 'face') NOT NULL DEFAULT 'name',
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gift_opens_opened (opened_at),
  CONSTRAINT fk_gift_opens_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
