INSERT INTO students (full_name, normalized_name, nickname, access_code, intro_message, class_name) VALUES
  ('Nguyễn Thúy Vy', 'nguyen thuy vy', 'Vy', 'vy1020', 'Chúc Vy luôn xinh đẹp và hạnh phúc!', 'A1'),
  ('Trần Mai Anh', 'tran mai anh', 'Anh', 'anh2010', 'Chúc Mai Anh học tốt và mãi tươi cười!', 'A1')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  normalized_name = VALUES(normalized_name),
  nickname = VALUES(nickname),
  intro_message = VALUES(intro_message),
  class_name = VALUES(class_name);

INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status)
SELECT id, 'Hoàng Nam', 'Lời chúc từ Nam', 'Chúc Vy ngày 20/10 vui vẻ nhé!', FALSE, 'approved'
FROM students WHERE access_code = 'vy1020'
  AND NOT EXISTS (SELECT 1 FROM letters WHERE title = 'Lời chúc từ Nam' AND content = 'Chúc Vy ngày 20/10 vui vẻ nhé!');

INSERT INTO letters (student_id, sender_name, title, content, is_anonymous, status)
SELECT id, NULL, 'Thư ẩn danh', 'Bạn là người tuyệt vời nhất lớp!', TRUE, 'approved'
FROM students WHERE access_code = 'vy1020'
  AND NOT EXISTS (SELECT 1 FROM letters WHERE title = 'Thư ẩn danh' AND content = 'Bạn là người tuyệt vời nhất lớp!');
