-- Compensate for installations where the historical duplicate-Hung migration
-- was already recorded before music and video ownership was included.

START TRANSACTION;

SET SQL_SAFE_UPDATES = 0;

CREATE TEMPORARY TABLE duplicate_hung_keeper AS
SELECT MIN(id) AS keep_id
FROM students
WHERE is_active = TRUE
  AND normalized_name = 'hung';

UPDATE gallery g
JOIN students s ON s.id = g.student_id
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET g.student_id = k.keep_id
WHERE s.id <> k.keep_id
  AND s.normalized_name = 'hung';

UPDATE letters l
JOIN students s ON s.id = l.student_id
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET l.student_id = k.keep_id
WHERE s.id <> k.keep_id
  AND s.normalized_name = 'hung';

UPDATE music m
JOIN students s ON s.id = m.student_id
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET m.student_id = k.keep_id
WHERE s.id <> k.keep_id
  AND s.normalized_name = 'hung';

UPDATE videos v
JOIN students s ON s.id = v.student_id
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET v.student_id = k.keep_id
WHERE s.id <> k.keep_id
  AND s.normalized_name = 'hung';

UPDATE students s
JOIN duplicate_hung_keeper k ON k.keep_id IS NOT NULL
SET s.is_active = FALSE
WHERE s.id <> k.keep_id
  AND s.is_active = TRUE
  AND s.normalized_name = 'hung';

DROP TEMPORARY TABLE duplicate_hung_keeper;

SET SQL_SAFE_UPDATES = 1;

COMMIT;
