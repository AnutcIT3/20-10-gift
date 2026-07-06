-- Gộp các bản ghi Hùng bị tạo trùng trong admin.
-- Giữ bản ghi active có id nhỏ nhất, chuyển ảnh/lời chúc sang bản ghi đó,
-- sau đó tắt các bản ghi Hùng active còn lại.

CREATE TEMPORARY TABLE duplicate_hung_keeper AS
SELECT MIN(id) AS keep_id
FROM students
WHERE is_active = TRUE
  AND BINARY LOWER(TRIM(full_name)) = BINARY LOWER('Hùng');

UPDATE gallery g
JOIN students s ON s.id = g.student_id
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET g.student_id = k.keep_id
WHERE s.id <> k.keep_id
  AND s.is_active = TRUE
  AND BINARY LOWER(TRIM(s.full_name)) = BINARY LOWER('Hùng');

UPDATE letters l
JOIN students s ON s.id = l.student_id
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET l.student_id = k.keep_id
WHERE s.id <> k.keep_id
  AND s.is_active = TRUE
  AND BINARY LOWER(TRIM(s.full_name)) = BINARY LOWER('Hùng');

UPDATE students s
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET s.is_active = FALSE
WHERE s.id <> k.keep_id
  AND s.is_active = TRUE
  AND BINARY LOWER(TRIM(s.full_name)) = BINARY LOWER('Hùng');

DROP TEMPORARY TABLE duplicate_hung_keeper;
