-- 20-10 Gift - Shared Data Snapshot
-- Restore: npm run migrate && npm run restore
-- Excludes admins, secrets, and schema_migrations.

SET FOREIGN_KEY_CHECKS = 0;

-- Table: students (21 rows)
DELETE FROM `students`;
INSERT INTO `students` (`id`, `full_name`, `normalized_name`, `nickname`, `avatar_url`, `intro_message`, `access_code`, `class_name`, `is_active`, `created_at`, `updated_at`, `view_count`, `seat_row`, `seat_col`) VALUES
(1, 'Nguyễn Thúy Vy', 'nguyen thuy vy', 'Vy', NULL, 'Chúc Vy luôn xinh đẹp và hạnh phúc!', 'vy1020', 'A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 1, 1),
(2, 'Trần Mai Anh', 'tran mai anh', 'Anh', NULL, 'Chúc Mai Anh học tốt và mãi tươi cười!', 'anh2010', 'A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 1, 2),
(3, 'Phương Anh', 'phuong anh', 'Phương Anh', NULL, 'Một món quà nhỏ dành riêng cho Phương Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-anh', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 1, 1, 3),
(4, 'Thanh Huyền', 'thanh huyen', 'Thanh Huyền', NULL, 'Một món quà nhỏ dành riêng cho Thanh Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thanh-huyen', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 3, 1, 4),
(5, 'Vũ Huyền', 'vu huyen', 'Vũ Huyền', NULL, 'Một món quà nhỏ dành riêng cho Vũ Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-vu-huyen', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 1, 5),
(6, 'Mai Huyền', 'mai huyen', 'Mai Huyền', NULL, 'Một món quà nhỏ dành riêng cho Mai Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-mai-huyen', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 1, 6),
(7, 'Phương Linh', 'phuong linh', 'Phương Linh', NULL, 'Một món quà nhỏ dành riêng cho Phương Linh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-linh', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 1, 2, 1),
(8, 'Diệu Linh', 'dieu linh', 'Linh A', NULL, 'Một món quà nhỏ dành riêng cho Linh Tần trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-linh-tan', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 2, 2, 2),
(9, 'Thúy', 'thuy', 'Thúy', NULL, 'Một món quà nhỏ dành riêng cho Thúy trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thuy-sac', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 2, 3),
(10, 'Thủy', 'thuy', 'Thủy', NULL, 'Một món quà nhỏ dành riêng cho Thủy trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thuy-hoi', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 1, 2, 4),
(11, 'My', 'my', 'chị của tuất', NULL, 'Một món quà nhỏ dành riêng cho My trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-my', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 1, 2, 5),
(12, 'Ngân', 'ngan', 'Ngân', NULL, 'Một món quà nhỏ dành riêng cho Ngân trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-ngan', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 2, 6),
(13, 'Giang', 'giang', 'Giang', NULL, 'Một món quà nhỏ dành riêng cho Giang trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-giang', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 3, 1),
(14, 'Phương', 'phuong', 'Phương', NULL, 'Một món quà nhỏ dành riêng cho Phương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:32:27', 1, 3, 2),
(15, 'Huyền Anh', 'huyen anh', 'Huyền Anh', NULL, 'Một món quà nhỏ dành riêng cho Huyền Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-huyen-anh', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 1, 3, 3),
(16, 'Vân Anh', 'van anh', 'Vân Anh', NULL, 'Một món quà nhỏ dành riêng cho Vân Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-van-anh', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 3, 4),
(17, 'Phượng', 'phuong', 'Phượng', NULL, 'Một món quà nhỏ dành riêng cho Phượng trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-sac', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 1, 3, 5),
(18, 'Ngọc', 'ngoc', 'Ngọc', NULL, 'Một món quà nhỏ dành riêng cho Ngọc trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-ngoc', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 3, 6),
(19, 'Hương', 'huong', 'Hương', NULL, 'Một món quà nhỏ dành riêng cho Hương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-huong', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:16', 0, 4, 1),
(20, 'Hùng', 'hung', 'Hùng', NULL, 'Một món quà nhỏ dành riêng cho Hùng trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-hung', '12A1', 1, '2026-07-07 23:18:48', '2026-07-30 06:27:36', 10, 4, 2),
(21, 'minh', 'minh', NULL, NULL, NULL, '7njiGFTJaimC', 'A1', 1, '2026-07-29 16:57:52', '2026-07-30 06:27:16', 1, 4, 3);

-- Table: gallery (2 rows)
DELETE FROM `gallery`;
INSERT INTO `gallery` (`id`, `student_id`, `image_url`, `public_id`, `resource_type`, `caption`, `display_order`, `created_at`, `updated_at`) VALUES
(2, 20, 'https://res.cloudinary.com/dibmyfkbv/image/upload/v1785341639/gift_20_10/qkgbgmknnlycfi5zf1w5.jpg', 'gift_20_10/qkgbgmknnlycfi5zf1w5', 'image', 'tuất', 0, '2026-07-29 16:14:00', '2026-07-29 16:17:40'),
(3, 20, 'https://res.cloudinary.com/dibmyfkbv/image/upload/v1785341639/gift_20_10/ghubn8rqgsdal6wzp3n7.jpg', 'gift_20_10/ghubn8rqgsdal6wzp3n7', 'image', NULL, 1, '2026-07-29 16:14:00', '2026-07-29 16:17:40');

-- Table: letters (5 rows)
DELETE FROM `letters`;
INSERT INTO `letters` (`id`, `student_id`, `sender_name`, `title`, `content`, `is_anonymous`, `status`, `created_at`, `updated_at`, `reveal_at`) VALUES
(1, 1, 'Hoàng Nam', 'Lời chúc từ Nam', 'Chúc Vy ngày 20/10 vui vẻ nhé!', 0, 'approved', '2026-07-07 23:18:48', '2026-07-07 23:18:48', NULL),
(2, 1, NULL, 'Thư ẩn danh', 'Bạn là người tuyệt vời nhất lớp!', 1, 'approved', '2026-07-07 23:18:48', '2026-07-07 23:18:48', NULL),
(3, 20, NULL, NULL, 'nguu', 1, 'approved', '2026-07-07 23:21:32', '2026-07-07 23:26:25', NULL),
(4, 20, 'tuấn', NULL, 'ngu x2', 0, 'approved', '2026-07-07 23:21:45', '2026-07-07 23:26:24', NULL),
(5, 3, NULL, NULL, 'chúc bạn 20-10 vui vẻ', 1, 'approved', '2026-07-29 16:48:42', '2026-07-29 17:12:42', NULL);

-- Table: letter_reactions (4 rows)
DELETE FROM `letter_reactions`;
INSERT INTO `letter_reactions` (`id`, `letter_id`, `emoji_key`, `session_id`, `created_at`) VALUES
(1, 4, 'think', '02f42a807d06a4331ba7d96a905d62b3', '2026-07-29 00:49:54'),
(2, 3, 'angry', '02f42a807d06a4331ba7d96a905d62b3', '2026-07-29 00:49:56'),
(3, 4, 'love', 'd5ff79a24b4584d1be04f6c9b2b4d4ca', '2026-07-29 16:07:43'),
(4, 3, 'kiss', 'd5ff79a24b4584d1be04f6c9b2b4d4ca', '2026-07-29 16:07:44');

-- Table: student_views (23 rows)
DELETE FROM `student_views`;
INSERT INTO `student_views` (`id`, `student_id`, `session_id`, `viewed_at`) VALUES
(1, 20, '02f42a807d06a4331ba7d96a905d62b3', '2026-07-29 15:16:31'),
(3, 20, '79c05694441f1588eb7d095fd6771b3d', '2026-07-29 15:17:00'),
(7, 4, '02f42a807d06a4331ba7d96a905d62b3', '2026-07-29 15:17:43'),
(9, 4, '79c05694441f1588eb7d095fd6771b3d', '2026-07-29 15:17:54'),
(13, 20, 'd5ff79a24b4584d1be04f6c9b2b4d4ca', '2026-07-29 16:07:38'),
(15, 20, '3526315b3d94833bc6bf2388ed82b78c', '2026-07-29 16:17:02'),
(16, 20, '361652bc256c5f5a4c870f43c96972fc', '2026-07-29 16:45:01'),
(17, 3, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:48:55'),
(18, 20, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:49:10'),
(19, 10, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:49:41'),
(20, 7, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:49:59'),
(21, 4, '361652bc256c5f5a4c870f43c96972fc', '2026-07-29 16:52:02'),
(22, 15, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:52:14'),
(23, 11, '7a23d03c424b9da2b01dab506416ae40', '2026-07-29 16:53:33'),
(25, 8, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:54:21'),
(26, 20, '3837f2c09e71bcb1b4c8fd8b38c51112', '2026-07-29 16:54:30'),
(29, 17, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:58:35'),
(30, 8, '361652bc256c5f5a4c870f43c96972fc', '2026-07-29 16:58:55'),
(31, 21, '1647003cc33deace0a400fa472f55f42', '2026-07-29 16:58:57'),
(35, 20, 'a95755bbd04bb590f94e84a2871c7401', '2026-07-30 03:43:00'),
(36, 20, '31a694ac76de32453ccd50bdfdbe1577', '2026-07-30 03:56:48'),
(37, 20, 'd071339662e874208c85f8e91f837bce', '2026-07-30 06:27:36'),
(39, 14, '1647003cc33deace0a400fa472f55f42', '2026-07-30 06:32:27');

SET FOREIGN_KEY_CHECKS = 1;
