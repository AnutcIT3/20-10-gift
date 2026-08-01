-- 20-10 Gift - Shared Data Snapshot
-- Restore: npm run migrate && npm run restore
-- Excludes admins, secrets, and schema_migrations.

SET FOREIGN_KEY_CHECKS = 0;

-- Table: students (20 rows)
DELETE FROM `students`;
INSERT INTO `students` (`id`, `full_name`, `normalized_name`, `nickname`, `avatar_url`, `intro_message`, `access_code`, `class_name`, `is_active`, `created_at`, `updated_at`, `seat_row`, `seat_col`, `view_count`) VALUES
(1, 'Nguyễn Thúy Vy', 'nguyen thuy vy', 'Vy', NULL, 'Chúc Vy luôn xinh đẹp và hạnh phúc!', 'vy1020', 'A1', 1, '2026-07-03 15:58:07', '2026-07-31 14:10:02', 1, 1, 0),
(2, 'Trần Mai Anh', 'tran mai anh', 'Anh', NULL, 'Chúc Mai Anh học tốt và mãi tươi cười!', 'anh2010', 'A1', 1, '2026-07-03 15:58:07', '2026-07-31 14:10:02', 1, 2, 0),
(4, 'Phương Anh', 'phuong anh', 'Phương Anh', NULL, 'Một món quà nhỏ dành riêng cho Phương Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-anh', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 4, 1, 1),
(5, 'Thanh Huyền', 'thanh huyen', 'Thanh Huyền', NULL, 'Một món quà nhỏ dành riêng cho Thanh Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thanh-huyen', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 4, 2, 0),
(6, 'Vũ Huyền', 'vu huyen', 'Vũ Huyền', NULL, 'Một món quà nhỏ dành riêng cho Vũ Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-vu-huyen', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 1, 4, 0),
(7, 'Mai Huyền', 'mai huyen', 'Mai Huyền', NULL, 'Một món quà nhỏ dành riêng cho Mai Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-mai-huyen', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 5, 6, 0),
(8, 'Phương Linh', 'phuong linh', 'Phương Linh', NULL, 'Một món quà nhỏ dành riêng cho Phương Linh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-linh', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:10:45', 4, 3, 1),
(9, 'Linh Tần', 'linh tan', 'Linh Tần', NULL, 'Một món quà nhỏ dành riêng cho Linh Tần trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-linh-tan', '12A1', 1, '2026-07-30 03:19:18', '2026-07-31 14:10:02', 2, 3, 0),
(10, 'Thúy', 'thuy', 'Thúy', NULL, 'Một món quà nhỏ dành riêng cho Thúy trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thuy-sac', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 6, 4, 0),
(11, 'Thủy', 'thuy', 'Thủy', NULL, 'Một món quà nhỏ dành riêng cho Thủy trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thuy-hoi', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:10:56', 6, 4, 1),
(12, 'My', 'my', 'My', NULL, 'Một món quà nhỏ dành riêng cho My trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-my', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 5, 2, 0),
(13, 'Ngân', 'ngan', 'Ngân', NULL, 'Một món quà nhỏ dành riêng cho Ngân trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-ngan', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 5, 5, 0),
(14, 'Giang', 'giang', 'Giang', NULL, 'Một món quà nhỏ dành riêng cho Giang trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-giang', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:13:23', 1, 8, 1),
(15, 'Phương', 'phuong', 'Phương', NULL, 'Một món quà nhỏ dành riêng cho Phương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:13:04', 5, 3, 1),
(16, 'Huyền Anh', 'huyen anh', 'Huyền Anh', NULL, 'Một món quà nhỏ dành riêng cho Huyền Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-huyen-anh', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:12:25', 2, 7, 1),
(17, 'Vân Anh', 'van anh', 'Vân Anh', NULL, 'Một món quà nhỏ dành riêng cho Vân Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-van-anh', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 6, 2, 0),
(18, 'Phượng', 'phuong', 'Phượng', NULL, 'Một món quà nhỏ dành riêng cho Phượng trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-sac', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 5, 3, 0),
(19, 'Ngọc', 'ngoc', 'Ngọc', NULL, 'Một món quà nhỏ dành riêng cho Ngọc trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-ngoc', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 3, 8, 0),
(20, 'Hương', 'huong', 'Hương', NULL, 'Một món quà nhỏ dành riêng cho Hương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-huong', '12A1', 1, '2026-07-30 03:19:18', '2026-07-31 14:10:02', 4, 2, 0),
(21, 'Hùng', 'hung', 'Hùng', NULL, 'Một món quà nhỏ dành riêng cho Hùng trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-hung', '12A1', 1, '2026-07-30 03:19:18', '2026-08-01 09:08:51', 5, 4, 1);

-- Table: gallery (0 rows)
DELETE FROM `gallery`;

-- Table: letters (4 rows)
DELETE FROM `letters`;
INSERT INTO `letters` (`id`, `student_id`, `sender_name`, `title`, `content`, `is_anonymous`, `status`, `created_at`, `updated_at`, `reveal_at`) VALUES
(1, 1, 'Hoàng Nam', 'Lời chúc từ Nam', 'Chúc Vy ngày 20/10 vui vẻ nhé!', 0, 'approved', '2026-07-03 15:58:07', '2026-07-03 15:58:07', NULL),
(2, 1, NULL, 'Thư ẩn danh', 'Bạn là người tuyệt vời nhất lớp!', 1, 'approved', '2026-07-03 15:58:07', '2026-07-03 15:58:07', NULL),
(3, 1, NULL, NULL, '20-10', 1, 'pending', '2026-07-06 13:25:39', '2026-07-06 13:25:39', NULL),
(4, 4, NULL, 'aaa', 'chúc bạn 20-10 vui vẻ', 1, 'pending', '2026-07-31 14:18:35', '2026-07-31 14:18:35', NULL);

-- Table: letter_reactions (0 rows)
DELETE FROM `letter_reactions`;

-- Table: student_views (7 rows)
DELETE FROM `student_views`;
INSERT INTO `student_views` (`id`, `student_id`, `session_id`, `viewed_at`) VALUES
(1, 4, '74ea4be7f99c5d0ede5526ce5c8c0bca', '2026-07-31 14:10:35'),
(4, 21, '74ea4be7f99c5d0ede5526ce5c8c0bca', '2026-07-31 14:10:47'),
(18, 8, '74ea4be7f99c5d0ede5526ce5c8c0bca', '2026-08-01 09:10:45'),
(21, 11, '74ea4be7f99c5d0ede5526ce5c8c0bca', '2026-08-01 09:10:56'),
(30, 16, '74ea4be7f99c5d0ede5526ce5c8c0bca', '2026-08-01 09:12:25'),
(39, 15, '74ea4be7f99c5d0ede5526ce5c8c0bca', '2026-08-01 09:13:04'),
(42, 14, '74ea4be7f99c5d0ede5526ce5c8c0bca', '2026-08-01 09:13:23');

SET FOREIGN_KEY_CHECKS = 1;
