-- Migration 023: ảnh kèm ba lời chúc riêng của từng bạn
-- Lời chúc riêng (dưới tên), 💌 lời chúc từ admin và ✨ lời chúc tự động đều
-- kèm được một ảnh, quản lý ở admin → Lời chúc → "Riêng từng bạn". Trên trang
-- quà mỗi loại vẫn nằm đúng chỗ cũ, chỉ hiện thêm ảnh. public_id để dọn ảnh
-- trên Cloudinary khi đổi, bỏ ảnh hay xoá hồ sơ.
ALTER TABLE students
  ADD COLUMN intro_image_url VARCHAR(500) NULL AFTER intro_message,
  ADD COLUMN intro_image_public_id VARCHAR(200) NULL AFTER intro_image_url,
  ADD COLUMN admin_wish_image_url VARCHAR(500) NULL AFTER admin_wish,
  ADD COLUMN admin_wish_image_public_id VARCHAR(200) NULL AFTER admin_wish_image_url,
  ADD COLUMN greeting_image_url VARCHAR(500) NULL,
  ADD COLUMN greeting_image_public_id VARCHAR(200) NULL;
