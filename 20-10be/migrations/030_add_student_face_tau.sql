-- Migration 030: ngưỡng Face ID riêng cho từng bạn
-- * face_tau: NULL = dùng ngưỡng chung FACE_TAU (0,45). Đặt thấp hơn cho bạn
--   nào camera hay chấm điểm sát ngưỡng mà vẫn rõ là bạn ấy (cách biệt vẫn
--   phải đủ FACE_MARGIN nên không nhận nhầm người khác dễ hơn bao nhiêu).
ALTER TABLE students
  ADD COLUMN face_tau DECIMAL(4,3) NULL AFTER search_aliases;
