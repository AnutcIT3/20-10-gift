# 20-10 Gift

Ứng dụng lưu bút số dành cho ngày Phụ nữ Việt Nam 20/10. Người dùng tìm tên để mở trang quà cá nhân; admin quản lý học sinh, ảnh và duyệt lời chúc.

## Trạng thái

Đã hoàn thành module 0–6:

- Express + MySQL + migrations, bảo mật và rate limit.
- GiftPage responsive, gallery/lightbox và nhạc bật/tắt thủ công.
- Public API: tìm tên, gift, gallery và lời chúc.
- Admin API: đăng nhập JWT, quản lý học sinh, gallery và lời chúc.
- Admin Dashboard hoàn chỉnh trên frontend.
- Frontend dùng API thật qua Axios.
- Tên không thuộc danh sách nhận lời chúc vui từ Gemini; nếu Gemini lỗi hoặc chưa cấu hình, backend dùng lời chúc tĩnh.

## Chạy nhanh trên Windows

Lần đầu trên một máy mới:

1. Cài Node.js 20+ và MySQL 8.
2. Double-click `setup-local.bat`.
3. Điền thông tin database, admin, Cloudinary và các biến môi trường cần dùng khi Notepad mở ra.
4. Script sẽ tạo schema, khôi phục dữ liệu dùng chung từ Git và tạo tài khoản admin cục bộ.
5. Sau khi setup thành công, double-click `start-dev.bat`.

Các lần sau chỉ cần `start-dev.bat`. Script mở backend, frontend và trình duyệt.

Để chủ động đồng bộ dữ liệu giữa các máy, double-click `sync-data.bat`:

- Chọn `1` để backup database của máy hiện tại, commit snapshot và push lên Git.
- Chọn `2` để pull snapshot mới nhất và cập nhật database của máy hiện tại.
- Lựa chọn `2` sẽ yêu cầu xác nhận vì nó thay thế dữ liệu dùng chung trên máy.

Chạy thủ công:

```powershell
# Terminal 1
cd 20-10be
npm run dev

# Terminal 2
cd 20-10fe
npm run dev
```

- Website: `http://localhost:5173`
- Admin: `http://localhost:5173/admin/login`
- Backend health: `http://localhost:5001/api/health`
- Backend ready: `http://localhost:5001/api/ready`

## Chia sẻ link tạm thời qua Cloudflare

1. Đảm bảo MySQL đang chạy và `20-10be/.env` đã được cấu hình.
2. Cài `cloudflared` trong `PATH`, hoặc đặt `cloudflared.exe` ở thư mục gốc dự án.
3. Double-click `start-public.bat`.
4. Chờ build, migration và readiness check hoàn tất; script sẽ in và mở link
   `https://...trycloudflare.com`.
5. Giữ cửa sổ script mở. Nhấn `Ctrl+C` để tắt tunnel và backend do script tạo.

Production build dùng `20-10fe/.env.production` với API cùng origin. Không đặt
`localhost` vào biến `VITE_API_BASE_URL` khi chia sẻ link cho máy khác.

Quick Tunnel tạo URL mới sau mỗi lần chạy và chỉ phù hợp cho demo ngắn hạn.
Link hiện tại được in trong cửa sổ script và tự động mở trên trình duyệt.

## Yêu cầu

- Node.js >= 20
- MySQL >= 8.0
- Cloudinary account để upload ảnh
- Gemini API key nếu muốn sinh lời chúc AI

## Cài đặt lần đầu

```powershell
cd 20-10be
npm install
npm run migrate
npm run restore
npm run create-admin

cd ../20-10fe
npm install
```

## Biến môi trường

Backend — `20-10be/.env`:

```env
PORT=5001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=gift_20_10

JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=24h
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace_with_admin_password

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

FRONTEND_URL=http://localhost:5173
```

Frontend — `20-10fe/.env.local`:

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:5001
```

Không commit `.env`, `.env.local`, API key hoặc secret lên Git.

## Đồng bộ dữ liệu giữa các máy

Repository lưu một snapshot dữ liệu dùng chung tại
`20-10be/backups/current-data.sql`. Snapshot gồm học sinh, gallery, lời chúc,
reaction, lượt xem và các mã truy cập trang quà; không gồm tài khoản admin, mật
khẩu, secret hoặc lịch sử migration. Chỉ commit snapshot này vào repository riêng
tư và giới hạn người được cấp quyền đọc.

Sau khi thay đổi dữ liệu trên máy chính:

```powershell
cd 20-10be
npm run backup:shared
cd ..
git add 20-10be/backups/current-data.sql
git commit -m "data: update shared snapshot"
git push
```

Hoặc double-click `sync-data.bat` và chọn `1`.

Trên máy khác, pull code rồi chạy `setup-local.bat`. Nếu máy đó đã cài đặt dự
án, có thể cập nhật thủ công:

```powershell
git pull
cd 20-10be
npm run migrate
npm run restore
npm run create-admin
```

Hoặc double-click `sync-data.bat` và chọn `2`.

`npm run restore` thay thế dữ liệu hiện có trong năm bảng dùng chung bằng nội
dung snapshot. Hãy chạy `npm run backup` trước để tạo một bản phục hồi cục bộ
nếu máy đích có dữ liệu riêng cần giữ lại. Các file backup cục bộ được Git bỏ qua.

File SQL chỉ lưu URL và `public_id` của ảnh, không chứa file ảnh. Muốn tiếp tục
quản lý hoặc xóa đúng các ảnh đã upload, các máy phải dùng cùng tài khoản
Cloudinary trong `.env`. Dữ liệu mới chỉ xuất hiện trên máy khác sau khi tạo lại
snapshot rồi commit và push.

## Routes frontend

| Path | Chức năng |
|---|---|
| `/` | Tìm tên và mở quà |
| `/gift/:accessCode` | Không gian cá nhân, chỉ xem lời chúc đã duyệt |
| `/celebrate/:name` | Lời chúc Gemini/fallback cho tên ngoài danh sách |
| `/admin/login` | Đăng nhập admin |
| `/admin` | Tổng quan |
| `/admin/students` | Quản lý học sinh |
| `/admin/gallery` | Upload, sắp xếp, xóa ảnh |
| `/admin/letters` | Duyệt, từ chối, xóa lời chúc |

## API chính

Public:

- `POST /api/students/resolve`
- `GET /api/gifts/:accessCode`
- `GET /api/gifts/:accessCode/gallery`
- `GET /api/gifts/:accessCode/letters`
- `POST /api/gifts/:accessCode/letters`
- `POST /api/greetings/generate`

Admin — yêu cầu `Authorization: Bearer <token>`:

- `POST /api/auth/admin/login`
- `/api/students/*`
- `/api/admin/students/:studentId/gallery`
- `/api/gallery/*`
- `/api/admin/letters`
- `/api/letters/*`

## Scripts

Backend:

- `npm run dev` — chạy bằng nodemon.
- `npm start` — chạy production.
- `npm run migrate` — chạy migrations idempotent.
- `npm run backup` — tạo backup phục hồi cục bộ, không commit lên Git.
- `npm run backup:shared` — cập nhật snapshot dùng chung; cần review trước khi commit.
- `npm run restore` — thay dữ liệu dùng chung bằng snapshot trong Git.
- `npm run create-admin` — tạo/cập nhật admin từ env.
- `npm test` — chạy test backend.

Frontend:

- `npm run dev` — Vite dev server.
- `npm run build` — production build.
- `npm run lint` — ESLint.

## Ghi chú

- Nhạc không autoplay; người dùng bấm nút **Bật nhạc** ở góc phải dưới.
- GiftPage không có form gửi lời chúc để tránh sai ngữ cảnh người nhận.
- Lời chúc mới qua public API có trạng thái `pending` và chỉ xuất hiện sau khi admin duyệt.
- Mọi tên được nhập đều nhận một lời chúc Gemini: người trong lớp xem trên GiftPage cá nhân, người ngoài danh sách xem trang chúc chung. Gemini key chỉ nằm ở backend để không lộ trên trình duyệt.
- Xem `PLAN.md` và `IMPLEMENTATION.md` để biết thiết kế và API contract ban đầu.
