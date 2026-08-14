-- Migration 015: bảng cấu hình ứng dụng
-- Dùng cho tính năng khóa trang quà chờ ngày 20/10: admin gửi link cho các bạn
-- nam chúc trước, đến ngày mới mở cho các bạn nữ vào xem.
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mặc định KHÔNG khóa để không đổi hành vi hiện có khi nâng cấp
INSERT INTO app_settings (setting_key, setting_value)
VALUES ('gift_pages_locked', '0')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
