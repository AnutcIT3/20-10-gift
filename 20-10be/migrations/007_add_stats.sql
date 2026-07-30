-- Migration 007: reveal_at cho phong thư + view_count + bảng dedup views

ALTER TABLE letters
  ADD COLUMN reveal_at DATETIME NULL DEFAULT NULL;

ALTER TABLE students
  ADD COLUMN view_count INT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS student_views (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  viewed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_view (student_id, session_id),
  INDEX idx_viewed_at (viewed_at),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
