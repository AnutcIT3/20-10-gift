START TRANSACTION;

SET SQL_SAFE_UPDATES = 0;

-- Preserve historical IDs while restoring canonical student identities.
UPDATE students
SET
  full_name = 'Linh Tần',
  normalized_name = 'linh tan',
  nickname = 'Linh Tần',
  intro_message = 'Một món quà nhỏ dành riêng cho Linh Tần trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.',
  class_name = '12A1'
WHERE access_code = '12a1-linh-tan';

UPDATE students legacy_student
LEFT JOIN students canonical_student
  ON canonical_student.access_code = '12a1-duong'
SET
  legacy_student.full_name = 'Dương',
  legacy_student.normalized_name = 'duong',
  legacy_student.nickname = 'Dương',
  legacy_student.intro_message = 'Một món quà nhỏ dành riêng cho Dương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.',
  legacy_student.access_code = '12a1-duong',
  legacy_student.class_name = '12A1'
WHERE legacy_student.access_code = '12a1-huong'
  AND canonical_student.id IS NULL;

-- Clear stale positions before applying the canonical 12A1 seating map.
UPDATE students SET seat_row = NULL, seat_col = NULL;

UPDATE students
SET
  seat_row = CASE access_code
    WHEN 'vy1020' THEN 1
    WHEN 'anh2010' THEN 1
    WHEN '12a1-thanh-huyen' THEN 1
    WHEN '12a1-giang' THEN 1
    WHEN '12a1-linh-tan' THEN 2
    WHEN '12a1-thuy-sac' THEN 2
    WHEN '12a1-huyen-anh' THEN 2
    WHEN '12a1-phuong' THEN 2
    WHEN '12a1-duong' THEN 3
    WHEN '12a1-ngoc' THEN 3
    WHEN '12a1-phuong-anh' THEN 4
    WHEN '12a1-vu-huyen' THEN 4
    WHEN '12a1-phuong-linh' THEN 4
    WHEN '12a1-my' THEN 5
    WHEN '12a1-phuong-sac' THEN 5
    WHEN '12a1-hung' THEN 5
    WHEN '12a1-ngan' THEN 5
    WHEN '12a1-mai-huyen' THEN 5
    WHEN '12a1-van-anh' THEN 6
    WHEN '12a1-thuy-hoi' THEN 6
  END,
  seat_col = CASE access_code
    WHEN 'vy1020' THEN 1
    WHEN 'anh2010' THEN 2
    WHEN '12a1-thanh-huyen' THEN 4
    WHEN '12a1-giang' THEN 8
    WHEN '12a1-linh-tan' THEN 3
    WHEN '12a1-thuy-sac' THEN 4
    WHEN '12a1-huyen-anh' THEN 7
    WHEN '12a1-phuong' THEN 8
    WHEN '12a1-duong' THEN 6
    WHEN '12a1-ngoc' THEN 8
    WHEN '12a1-phuong-anh' THEN 1
    WHEN '12a1-vu-huyen' THEN 2
    WHEN '12a1-phuong-linh' THEN 3
    WHEN '12a1-my' THEN 2
    WHEN '12a1-phuong-sac' THEN 3
    WHEN '12a1-hung' THEN 4
    WHEN '12a1-ngan' THEN 5
    WHEN '12a1-mai-huyen' THEN 6
    WHEN '12a1-van-anh' THEN 2
    WHEN '12a1-thuy-hoi' THEN 4
  END,
  is_active = TRUE
WHERE access_code IN (
  'vy1020',
  'anh2010',
  '12a1-thanh-huyen',
  '12a1-giang',
  '12a1-linh-tan',
  '12a1-thuy-sac',
  '12a1-huyen-anh',
  '12a1-phuong',
  '12a1-duong',
  '12a1-ngoc',
  '12a1-phuong-anh',
  '12a1-vu-huyen',
  '12a1-phuong-linh',
  '12a1-my',
  '12a1-phuong-sac',
  '12a1-hung',
  '12a1-ngan',
  '12a1-mai-huyen',
  '12a1-van-anh',
  '12a1-thuy-hoi'
);

UPDATE students
SET is_active = FALSE, seat_row = NULL, seat_col = NULL
WHERE normalized_name = 'minh';

SET SQL_SAFE_UPDATES = 1;

COMMIT;
