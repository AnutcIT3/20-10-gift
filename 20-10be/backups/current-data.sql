-- 20-10 Gift - Shared Data Snapshot
-- Restore: npm run migrate && npm run restore
-- Excludes admins, secrets, and schema_migrations.
-- Contains private gift access codes. Commit only to a private repository.

SET FOREIGN_KEY_CHECKS = 0;

-- Table: students (24 rows)
DELETE FROM `students`;
INSERT INTO `students` (`id`, `full_name`, `normalized_name`, `nickname`, `avatar_url`, `intro_message`, `access_code`, `class_name`, `is_active`, `created_at`, `updated_at`, `seat_row`, `seat_col`, `view_count`, `member_type`) VALUES
(1, 'Nguyễn Thúy Vy', 'nguyen thuy vy', 'Vy', NULL, 'Chúc Vy luôn xinh đẹp và hạnh phúc!', 'vy1020', 'A1', 1, '2026-07-07 16:18:48', '2026-08-04 02:45:12', 1, 1, 0, 'class'),
(2, 'Trần Mai Anh', 'tran mai anh', 'Anh', NULL, 'Chúc Mai Anh học tốt và mãi tươi cười!', 'anh2010', 'A1', 1, '2026-07-07 16:18:48', '2026-08-04 02:45:12', 1, 2, 0, 'class'),
(3, 'Phương Anh', 'phuong anh', 'Phương Anh', NULL, 'Một món quà nhỏ dành riêng cho Phương Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-anh', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 4, 1, 1, 'class'),
(4, 'Thanh Huyền', 'thanh huyen', 'Thanh Huyền', NULL, 'Một món quà nhỏ dành riêng cho Thanh Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thanh-huyen', '12A1', 1, '2026-07-07 16:18:48', '2026-09-08 17:59:28', 1, 4, 6, 'class'),
(5, 'Vũ Huyền', 'vu huyen', 'Vũ Huyền', NULL, 'Một món quà nhỏ dành riêng cho Vũ Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-vu-huyen', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 4, 2, 0, 'class'),
(6, 'Mai Huyền', 'mai huyen', 'Mai Huyền', NULL, 'Một món quà nhỏ dành riêng cho Mai Huyền trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-mai-huyen', '12A1', 1, '2026-07-07 16:18:48', '2026-09-08 17:33:22', 5, 6, 2, 'class'),
(7, 'Phương Linh', 'phuong linh', 'Phương Linh', NULL, 'Một món quà nhỏ dành riêng cho Phương Linh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-linh', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 4, 3, 1, 'class'),
(8, 'Linh Tần', 'linh tan', 'Linh Tần', NULL, 'Một món quà nhỏ dành riêng cho Linh Tần trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-linh-tan', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 2, 3, 2, 'class'),
(9, 'Thúy', 'thuy', 'Thúy', NULL, 'Một món quà nhỏ dành riêng cho Thúy trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thuy-sac', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 2, 4, 0, 'class'),
(10, 'Thủy', 'thuy', 'Thủy', NULL, 'Một món quà nhỏ dành riêng cho Thủy trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-thuy-hoi', '12A1', 1, '2026-07-07 16:18:48', '2026-09-08 17:42:01', 6, 4, 4, 'class'),
(11, 'My', 'my', 'chị của tuất', NULL, 'Một món quà nhỏ dành riêng cho My trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-my', '12A1', 1, '2026-07-07 16:18:48', '2026-09-08 17:54:00', 5, 1, 3, 'class'),
(12, 'Ngân', 'ngan', 'Ngân', NULL, 'Một món quà nhỏ dành riêng cho Ngân trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-ngan', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 5, 5, 0, 'class'),
(13, 'Giang', 'giang', 'Giang', NULL, 'Một món quà nhỏ dành riêng cho Giang trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-giang', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 1, 8, 0, 'class'),
(14, 'Phương', 'phuong', 'Phương', NULL, 'Một món quà nhỏ dành riêng cho Phương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 2, 8, 1, 'class'),
(15, 'Huyền Anh', 'huyen anh', 'Huyền Anh', NULL, 'Một món quà nhỏ dành riêng cho Huyền Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-huyen-anh', '12A1', 1, '2026-07-07 16:18:48', '2026-09-08 17:33:40', 2, 7, 3, 'class'),
(16, 'Vân Anh', 'van anh', 'Vân Anh', NULL, 'Một món quà nhỏ dành riêng cho Vân Anh trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-van-anh', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 6, 2, 0, 'class'),
(17, 'Phượng', 'phuong', 'Phượng', NULL, 'Một món quà nhỏ dành riêng cho Phượng trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-phuong-sac', '12A1', 1, '2026-07-07 16:18:48', '2026-08-04 02:54:49', 0, 9, 1, 'class'),
(18, 'Ngọc', 'ngoc', 'Ngọc', NULL, 'Một món quà nhỏ dành riêng cho Ngọc trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-ngoc', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 3, 8, 0, 'class'),
(19, 'Dương', 'duong', 'Dương', NULL, 'Một món quà nhỏ dành riêng cho Dương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-duong', '12A1', 1, '2026-07-07 16:18:48', '2026-08-03 22:50:08', 3, 6, 0, 'class'),
(20, 'Hùng', 'hung', 'Hùng', NULL, 'Một món quà nhỏ dành riêng cho Hùng trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-hung', '12A1', 1, '2026-07-07 16:18:48', '2026-09-08 17:51:34', 5, 3, 14, 'class'),
(21, 'minh', 'minh', NULL, NULL, NULL, '7njiGFTJaimC', 'A1', 1, '2026-07-29 09:57:52', '2026-08-04 02:48:48', 6, 8, 2, 'class'),
(22, 'Hương', 'huong', 'Hương', NULL, 'Một món quà nhỏ dành riêng cho Hương trong ngày 20/10. Chúc bạn luôn rạng rỡ, tự tin và gặp thật nhiều điều tốt đẹp.', '12a1-huong', '12A1', 1, '2026-08-04 02:54:49', '2026-09-08 17:51:39', 5, 2, 0, 'class'),
(23, 'Linh', 'linh', NULL, NULL, NULL, 'Xy-nuPxCgjl2', 'Bạn bè', 1, '2026-09-08 17:40:35', '2026-09-08 18:01:08', NULL, NULL, 2, 'friend'),
(24, 'Mĩ', 'mi', NULL, NULL, NULL, '2RtGWcLLAuCv', 'Bạn bè', 1, '2026-09-08 18:01:30', '2026-09-08 18:02:54', NULL, NULL, 1, 'friend');

-- Table: gallery (2 rows)
DELETE FROM `gallery`;
INSERT INTO `gallery` (`id`, `student_id`, `image_url`, `public_id`, `resource_type`, `caption`, `display_order`, `created_at`, `updated_at`) VALUES
(2, 20, 'https://res.cloudinary.com/dibmyfkbv/image/upload/v1785341639/gift_20_10/qkgbgmknnlycfi5zf1w5.jpg', 'gift_20_10/qkgbgmknnlycfi5zf1w5', 'image', 'tuất', 0, '2026-07-29 09:14:00', '2026-09-08 18:09:30'),
(3, 20, 'https://res.cloudinary.com/dibmyfkbv/image/upload/v1785341639/gift_20_10/ghubn8rqgsdal6wzp3n7.jpg', 'gift_20_10/ghubn8rqgsdal6wzp3n7', 'image', NULL, 1, '2026-07-29 09:14:00', '2026-09-08 18:09:30');

-- Table: letters (34 rows)
DELETE FROM `letters`;
INSERT INTO `letters` (`id`, `student_id`, `sender_name`, `title`, `content`, `is_anonymous`, `status`, `created_at`, `updated_at`, `reveal_at`, `image_url`, `image_public_id`) VALUES
(1, 1, 'Hoàng Nam', 'Lời chúc từ Nam', 'Chúc Vy ngày 20/10 vui vẻ nhé!', 0, 'approved', '2026-07-07 16:18:48', '2026-07-07 16:18:48', NULL, NULL, NULL),
(2, 1, NULL, 'Thư ẩn danh', 'Bạn là người tuyệt vời nhất lớp!', 1, 'approved', '2026-07-07 16:18:48', '2026-07-07 16:18:48', NULL, NULL, NULL),
(3, 20, NULL, NULL, 'nguu', 1, 'approved', '2026-07-07 16:21:32', '2026-07-07 16:26:25', NULL, NULL, NULL),
(4, 20, 'tuấn', NULL, 'ngu x2', 0, 'approved', '2026-07-07 16:21:45', '2026-07-07 16:26:24', NULL, NULL, NULL),
(5, 3, NULL, NULL, 'chúc bạn 20-10 vui vẻ', 1, 'approved', '2026-07-29 09:48:42', '2026-07-29 10:12:42', NULL, NULL, NULL),
(7, 3, 'ádasdas', NULL, 'sấdasdasd', 0, 'approved', '2026-08-14 06:28:40', '2026-08-14 06:29:03', NULL, NULL, NULL),
(8, 15, NULL, 'Gửi bạn', 'Cảm ơn', 1, 'approved', '2026-09-08 17:38:32', '2026-09-08 17:39:40', NULL, NULL, NULL),
(9, 23, NULL, 'Thư', 'Cảm ơn', 1, 'approved', '2026-09-08 17:40:36', '2026-09-08 17:41:28', NULL, NULL, NULL),
(10, 20, NULL, 'nguuu', 'hùng ăn cứt', 1, 'approved', '2026-09-08 17:46:23', '2026-09-08 17:46:48', NULL, 'https://res.cloudinary.com/dibmyfkbv/image/upload/v1788889582/gift_20_10/gaazirla0zoi5bxabtsq.jpg', 'gift_20_10/gaazirla0zoi5bxabtsq'),
(11, 19, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(12, 13, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(13, 20, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(14, 22, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(15, 15, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(16, 23, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(17, 8, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(18, 6, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(19, 21, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(20, 11, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:56', '2026-09-08 17:47:56', NULL, NULL, NULL),
(21, 12, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(22, 18, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(23, 1, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(24, 14, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(25, 17, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(26, 3, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(27, 7, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(28, 4, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(29, 10, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(30, 9, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(31, 2, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(32, 16, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(33, 5, 'Admin', 'lời chúc từ admin hí hí', 'chúc các cậu hí hí hí hí', 0, 'approved', '2026-09-08 17:47:57', '2026-09-08 17:47:57', NULL, NULL, NULL),
(34, 11, 'Dũng', 'Nyc', 'Nhớ bạn', 0, 'approved', '2026-09-08 17:51:23', '2026-09-08 17:52:29', NULL, 'https://res.cloudinary.com/dibmyfkbv/image/upload/v1788889883/gift_20_10/jqdigw8o4efhx1qiilhf.jpg', 'gift_20_10/jqdigw8o4efhx1qiilhf'),
(35, 24, 'Nga', 'Hạt nhân', 'Rút quân khỏi U cà', 0, 'approved', '2026-09-08 18:01:31', '2026-09-08 18:02:42', NULL, 'https://res.cloudinary.com/dibmyfkbv/image/upload/v1788890489/gift_20_10/jcfgihmxu7xqqbyc9uri.jpg', 'gift_20_10/jcfgihmxu7xqqbyc9uri');

-- Table: letter_reactions (6 rows)
DELETE FROM `letter_reactions`;
INSERT INTO `letter_reactions` (`id`, `letter_id`, `emoji_key`, `session_id`, `created_at`) VALUES
(1, 4, 'think', '02f42a807d06a4331ba7d96a905d62b3', '2026-07-28 17:49:54'),
(2, 3, 'angry', '02f42a807d06a4331ba7d96a905d62b3', '2026-07-28 17:49:56'),
(3, 4, 'love', 'd5ff79a24b4584d1be04f6c9b2b4d4ca', '2026-07-29 09:07:43'),
(4, 3, 'kiss', 'd5ff79a24b4584d1be04f6c9b2b4d4ca', '2026-07-29 09:07:44'),
(5, 8, 'thumbsup', '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:39:58'),
(6, 10, 'smile', '9a612ef572aca79e350fa627c1aa94f4', '2026-09-08 18:09:09');

-- Table: student_views (43 rows)
DELETE FROM `student_views`;
INSERT INTO `student_views` (`id`, `student_id`, `session_id`, `viewed_at`) VALUES
(1, 20, '02f42a807d06a4331ba7d96a905d62b3', '2026-07-29 08:16:31'),
(3, 20, '79c05694441f1588eb7d095fd6771b3d', '2026-07-29 08:17:00'),
(7, 4, '02f42a807d06a4331ba7d96a905d62b3', '2026-07-29 08:17:43'),
(9, 4, '79c05694441f1588eb7d095fd6771b3d', '2026-07-29 08:17:54'),
(13, 20, 'd5ff79a24b4584d1be04f6c9b2b4d4ca', '2026-07-29 09:07:38'),
(15, 20, '3526315b3d94833bc6bf2388ed82b78c', '2026-07-29 09:17:02'),
(16, 20, '361652bc256c5f5a4c870f43c96972fc', '2026-07-29 09:45:01'),
(17, 3, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:48:55'),
(18, 20, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:49:10'),
(19, 10, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:49:41'),
(20, 7, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:49:59'),
(21, 4, '361652bc256c5f5a4c870f43c96972fc', '2026-07-29 09:52:02'),
(22, 15, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:52:14'),
(23, 11, '7a23d03c424b9da2b01dab506416ae40', '2026-07-29 09:53:33'),
(25, 8, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:54:21'),
(26, 20, '3837f2c09e71bcb1b4c8fd8b38c51112', '2026-07-29 09:54:30'),
(29, 17, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:58:35'),
(30, 8, '361652bc256c5f5a4c870f43c96972fc', '2026-07-29 09:58:55'),
(31, 21, '1647003cc33deace0a400fa472f55f42', '2026-07-29 09:58:57'),
(35, 20, 'a95755bbd04bb590f94e84a2871c7401', '2026-07-29 20:43:00'),
(36, 20, '31a694ac76de32453ccd50bdfdbe1577', '2026-07-29 20:56:48'),
(37, 20, 'd071339662e874208c85f8e91f837bce', '2026-07-29 23:27:36'),
(39, 14, '1647003cc33deace0a400fa472f55f42', '2026-07-29 23:32:27'),
(43, 21, 'de67babb7441ccdbe1d406e747f0846c', '2026-08-04 02:25:55'),
(46, 4, 'dbbad8a4ccc4eebe4421be83d9062ed7', '2026-08-14 09:52:57'),
(48, 6, 'dbbad8a4ccc4eebe4421be83d9062ed7', '2026-08-14 09:54:02'),
(49, 20, '02b04a2e1027a8064d2893e5c0e16665', '2026-09-08 16:47:29'),
(51, 15, '348c980273f9a4fae81cc8c7e157a65c', '2026-09-08 17:27:45'),
(54, 20, '9a612ef572aca79e350fa627c1aa94f4', '2026-09-08 17:31:08'),
(56, 10, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:32:57'),
(58, 6, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:33:21'),
(60, 15, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:33:40'),
(61, 20, 'e402afabd2dd8626ccefcf90b754e7ed', '2026-09-08 17:34:03'),
(62, 4, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:35:08'),
(64, 10, 'faf4b040c5c68076fdf4812c119daf3a', '2026-09-08 17:35:16'),
(79, 23, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:40:43'),
(85, 10, '9a612ef572aca79e350fa627c1aa94f4', '2026-09-08 17:42:01'),
(93, 20, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:47:17'),
(95, 11, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 17:53:11'),
(97, 11, '9a612ef572aca79e350fa627c1aa94f4', '2026-09-08 17:53:59'),
(101, 4, '9a612ef572aca79e350fa627c1aa94f4', '2026-09-08 17:59:28'),
(103, 23, '9a612ef572aca79e350fa627c1aa94f4', '2026-09-08 18:01:08'),
(105, 24, '6f52ebd3e4bc35cd1d54eb9ac5c52f10', '2026-09-08 18:02:54');

SET FOREIGN_KEY_CHECKS = 1;
