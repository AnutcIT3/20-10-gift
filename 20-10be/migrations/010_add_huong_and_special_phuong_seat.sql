START TRANSACTION;

UPDATE students
SET seat_row = 0, seat_col = 9
WHERE access_code = '12a1-phuong-sac';

INSERT INTO students (
  full_name,
  normalized_name,
  nickname,
  avatar_url,
  access_code,
  intro_message,
  class_name,
  is_active,
  seat_row,
  seat_col
)
SELECT
  'Hương',
  'huong',
  'Hương',
  NULL,
  '12a1-huong',
  'Một món quà nhỏ dành riêng cho Hương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.',
  '12A1',
  TRUE,
  5,
  3
WHERE NOT EXISTS (
  SELECT 1 FROM students WHERE access_code = '12a1-huong'
);

UPDATE students
SET
  full_name = 'Hương',
  normalized_name = 'huong',
  nickname = 'Hương',
  intro_message = 'Một món quà nhỏ dành riêng cho Hương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.',
  class_name = '12A1',
  is_active = TRUE,
  seat_row = 5,
  seat_col = 3
WHERE access_code = '12a1-huong';

COMMIT;
