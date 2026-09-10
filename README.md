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
- Face ID (tùy chọn): bạn trong lớp có thể mở trang quà bằng camera thay vì gõ tên. Tính năng tự ẩn khi service Python không chạy hoặc admin tắt công tắc — xem mục [Face ID](#face-id-tùy-chọn).

## Chạy nhanh trên Windows

Lần đầu trên một máy mới:

1. Cài Node.js 20+ và MySQL 8. Muốn dùng Face ID thì cài thêm Python 3.11 (tùy chọn).
2. Double-click `setup-local.bat`.
3. Điền thông tin database, admin, Cloudinary và các biến môi trường cần dùng khi Notepad mở ra.
4. Script sẽ tạo schema, khôi phục dữ liệu dùng chung từ Git và tạo tài khoản admin cục bộ. Bước cuối tạo `face-service/.venv` nếu máy có Python 3.11; không có thì bỏ qua với một dòng cảnh báo, web vẫn chạy bình thường.
5. Sau khi setup thành công, double-click `start-dev.bat`.

Các lần sau chỉ cần `start-dev.bat`. Script mở ba cửa sổ — backend, frontend và
face-service (cửa sổ thứ ba chỉ mở khi đã có `face-service/.venv`) — rồi mở
trình duyệt. Face-service cần vài giây nạp model; thẻ ✨ Face ID trên trang chủ
tự hiện khi service sẵn sàng.

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

# Terminal 3 — tùy chọn, Face ID
cd face-service
.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 5002
```

- Website: `http://localhost:5173`
- Admin: `http://localhost:5173/admin/login`
- Backend health: `http://localhost:5001/api/health`
- Backend ready: `http://localhost:5001/api/ready`
- Face-service health: `http://127.0.0.1:5002/health` (chỉ nghe trên máy, không ra mạng)
- Trạng thái Face ID mà trang chủ nhìn thấy: `http://localhost:5001/api/face/status`

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

Public mode cũng tự khởi động face-service (ẩn, ghi log ra `%TEMP%\gift-face-*.log`)
nếu có `face-service/.venv`, chờ tối đa 60 giây cho model nạp xong rồi in dòng
`FACE ID: san sang` hoặc `FACE ID: tat (web van chay)` trong bảng link. Service
không lên được thì tunnel vẫn mở bình thường, chỉ thiếu thẻ Face ID. Link
`https://...trycloudflare.com` là secure context nên camera dùng được trên điện
thoại; link LAN `http://192.168...` thì trình duyệt không cho mở camera, thẻ Face
ID tự ẩn ở đó.

## Face ID (tùy chọn)

Bạn trong lớp đứng trước camera là mở được trang quà của mình, không cần gõ
tên. Thiết kế và các quyết định nằm trong `FACE_PLAN.md`; số đo chọn model nằm
trong `face-service/RESULTS.md` (ArcFace w600k_r50, ngưỡng τ = 0,45, margin
top1 − top2 ≥ 0,10).

Ba phần ghép lại:

- `face-service/` — FastAPI + insightface, chạy trên `127.0.0.1:5002`. Chỉ nhận
  một ảnh và trả về vector 512 chiều kèm chỉ số chất lượng; không biết database,
  không giữ trạng thái, không ghi ảnh ra đĩa. Chi tiết trong `face-service/README.md`.
- Backend Node — giữ hồ sơ khuôn mặt trong bảng `face_profiles`, so khớp, áp
  ngưỡng, rate limit riêng (350 request / 15 phút / IP) và công tắc `face_enabled`.
- Frontend — thẻ **✨ Face ID** cạnh ô gõ tên trên trang chủ, mở khung quét
  camera; hai khung liên tiếp cùng nhận ra một người thì hỏi "Có phải cậu là …?"
  rồi mới mở trang quà.

Thẻ Face ID **chỉ hiện khi đủ ba điều kiện**: trang chạy trên HTTPS hoặc
`localhost`, trình duyệt có camera, và `GET /api/face/status` trả `enabled: true`
(công tắc bật + face-service trả lời `/health` + có ít nhất một hồ sơ đã đăng
ký). Thiếu một điều kiện thì thẻ biến mất, không bao giờ có nút bấm-vào-là-lỗi.

Bật tính năng lần đầu:

1. Cài Python 3.11, chạy lại `setup-local.bat` (hoặc tạo venv thủ công theo
   mục *Cài đặt lần đầu*) để có `face-service/.venv`.
2. Chạy `start-dev.bat`; cửa sổ thứ ba là face-service. Kiểm tra
   `http://127.0.0.1:5002/health` trả `status: "ok"` và `model: "arcface_r50"`.
3. Tạo bảng một lần: trong `20-10be` chạy `npm run migrate` (migration 017 tạo
   `face_profiles`, `face_match_log` và công tắc `face_enabled` mặc định tắt).
   `start-dev.bat` không tự chạy migrate; `start-public.bat` và `setup-local.bat` thì có.
4. Đăng ký hồ sơ: đặt ảnh vào `bench/photos/<Họ và tên đúng như database>/`
   (thư mục này nằm ngoài Git) rồi trong `20-10be` chạy `npm run face:enroll`.
   Script in bảng "thư mục → học sinh", báo `CHƯA KHỚP` nếu tên không trùng, và
   ghi một vector trung bình cho mỗi bạn. Thêm `--dry-run` để chỉ xem bảng khớp
   tên; hoặc `npm run face:enroll -- --student <id> --images a.jpg b.jpg` để
   đăng ký một bạn từ ảnh bất kỳ. Ảnh chỉ đi qua bộ nhớ, không được sao chép.
5. Vào admin, gạt công tắc **✨ Face ID** ở sidebar (key `face_enabled` trong
   `app_settings`, mặc định tắt). Tắt công tắc là thẻ biến mất ngay trên trang
   chủ, không cần restart.

Riêng tư: từng khung hình chỉ dùng để so khớp ngay lúc đó rồi bỏ; server chỉ ghi
số (điểm, margin, cỡ mặt, độ sáng, câu trả lời "đúng là mình / không phải") vào
`face_match_log` để Dashboard đếm. `face_profiles` và `face_match_log` **không**
nằm trong snapshot `backup:shared`/`restore`, nên sinh trắc không bao giờ lên Git;
đổi máy thì đăng ký lại bằng `npm run face:enroll`.

Thẻ không hiện? Kiểm tra theo thứ tự: `/health` của face-service, công tắc
`face_enabled`, số `profiles` trong `GET /api/face/status`, và trang có đang mở
qua HTTPS/localhost không.

## Yêu cầu

- Node.js >= 20
- MySQL >= 8.0
- Python 3.11 (tùy chọn, cho Face ID)
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

# Tùy chọn — Face ID (cần Python 3.11)
cd ../face-service
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
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

# TLS — bắt buộc khi dùng MySQL cloud (Aiven/TiDB/Azure), để false khi chạy local
DB_SSL=false
DB_SSL_CA=

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

# Face ID (tùy chọn) — bỏ trống thì mặc định 127.0.0.1:5002 vẫn dùng được
FACE_SERVICE_URL=http://127.0.0.1:5002
```

Frontend — `20-10fe/.env.local`:

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:5001
```

Không commit `.env`, `.env.local`, API key hoặc secret lên Git.

## Đồng bộ dữ liệu giữa các máy

**Cách hiện dùng: một MySQL dùng chung trên cloud (Aiven).** Cả hai máy trỏ
`.env` vào cùng một database nên luôn giống nhau — không còn phải backup/restore
qua lại, không còn khả năng lệch dữ liệu. Chuyển máy chỉ cần `git pull` cho code.

Cấu hình trên **mỗi** máy (giá trị lấy từ *Connection information* trong console
Aiven; `ca.pem` tải ở cùng chỗ đó):

```env
DB_HOST=<host>.aivencloud.com
DB_PORT=<port>
DB_USER=avnadmin
DB_PASSWORD=<mật khẩu>
DB_NAME=defaultdb
DB_SSL=true
DB_SSL_CA=certs/aiven-ca.pem   # để trống thì vẫn mã hóa nhưng không xác thực CA
```

Chạy `npm run db:check` để xác nhận máy đang nối vào đâu, độ trễ bao nhiêu và có
bao nhiêu dữ liệu. Lần đầu dựng database mới thì chạy `npm run migrate` rồi
`npm run restore`, và `npm run create-admin` (tài khoản admin không nằm trong
snapshot).

Lưu ý khi dùng MySQL cloud:

- **Cần mạng để chạy dự án.** Muốn làm offline thì đổi `.env` về MySQL local
  (giữ sẵn bản sao cấu hình cũ để bỏ dấu ghi chú là quay về được ngay).
- **Trạng thái khóa 20/10 giờ dùng chung** cho cả hai máy, vì nó nằm trong
  database.
- Gói free của Aiven **tự tắt service khi lâu không dùng** và **không có backup
  tự động** — vẫn nên chạy `npm run backup:shared` định kỳ (xem phần dưới).

### Cách cũ: snapshot qua Git (nay dùng làm sao lưu)

Cơ chế dưới đây vẫn hoạt động và giờ đóng vai trò **lưới an toàn** thay vì công
cụ đồng bộ: nó kéo toàn bộ dữ liệu từ database hiện tại về một file `.sql` trong
Git. Nếu dịch vụ cloud gặp sự cố, đổi `.env` về local rồi `npm run restore` là
chạy lại được trong vài phút.

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
Cloudinary trong `.env`. Git chỉ chuyển một bản chụp dữ liệu sang máy chủ khác;
các admin dùng cùng URL public không cần pull Git để thấy thay đổi trực tiếp.

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
| `/admin/seating` | Sơ đồ lớp, xếp chỗ ngồi |

## API chính

Public:

- `POST /api/students/resolve`
- `GET /api/gifts/:accessCode`
- `GET /api/gifts/:accessCode/gallery`
- `GET /api/gifts/:accessCode/letters`
- `POST /api/gifts/:accessCode/letters`
- `POST /api/greetings/generate`
- `GET /api/face/status` — `{ enabled, model, profiles }`; trang chủ dựa vào đây để hiện/ẩn thẻ Face ID, không bao giờ lỗi (mọi sự cố → `enabled: false`)
- `POST /api/face/match` — multipart, một file `frame` (JPEG/PNG/WebP ≤ 1 MB); trả `decision` là `match` (kèm `matchId`, `giftPath`, `displayName`, `score`, `margin`), `reject`, `no_face`, `low_quality` (`reason`: `small`/`dark`/`blurry`) hoặc `many_faces`; 503 khi Face ID tắt hoặc service không trả lời, 429 khi quá 350 request/15 phút
- `POST /api/face/confirm` — JSON `{ matchId, confirmed }`, ghi câu trả lời "đúng là mình / không phải" vào `face_match_log` (chỉ số, không ảnh)

Admin — yêu cầu `Authorization: Bearer <token>`:

- `POST /api/auth/admin/login`
- `/api/students/*`
- `/api/admin/students/:studentId/gallery`
- `/api/gallery/*`
- `/api/admin/letters`
- `/api/letters/*`
- `GET/PATCH /api/admin/settings` — khóa/mở trang quà chờ ngày 20/10 (`gift_pages_locked`) và bật/tắt Face ID (`face_enabled`); PATCH gửi một trong hai key

## Scripts

Backend:

- `npm run dev` — chạy bằng nodemon.
- `npm start` — chạy production.
- `npm run migrate` — chạy migrations idempotent.
- `npm run db:check` — cho biết đang nối vào database nào, độ trễ và số dữ liệu hiện có.
- `npm run backup` — tạo backup phục hồi cục bộ, không commit lên Git.
- `npm run backup:shared` — cập nhật snapshot dùng chung; cần review trước khi commit.
- `npm run restore` — thay dữ liệu dùng chung bằng snapshot trong Git.
- `npm run create-admin` — tạo/cập nhật admin từ env.
- `npm run face:enroll` — đăng ký hồ sơ Face ID từ `bench/photos/<Họ và tên>/` (cần face-service đang chạy); `-- --dry-run` chỉ xem bảng khớp tên, `-- --student <id> --images ...` đăng ký một bạn.
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
- Tên ngoài danh sách được hỏi "thành viên trong lớp hay khách ghé thăm" trước khi hiện lời chúc — hai kiểu lời chúc khác nhau (`classmate` / `visitor`).
- Admin có thể **khóa trang quà chờ ngày 20/10** bằng công tắc **Trang quà** ở sidebar admin: người mở trang quà thấy "Chưa đến ngày 20/10, vui lòng chờ thêm", nhưng gửi lời chúc vẫn hoạt động — gửi link cho các bạn nam chúc trước, đến ngày admin gạt công tắc để mở.
- Công tắc **✨ Face ID** nằm ngay dưới công tắc Trang quà, mặc định tắt. Quét mặt vẫn chạy khi trang quà đang khóa (nhận ra rồi mới gặp màn "chưa đến ngày"), nên bật Face ID sớm để thử không làm lộ quà. Dashboard có thẻ ✨ Face ID đếm số lượt nhận ra / từ chối / xác nhận đúng / xác nhận sai.
- Xem `PLAN.md` và `IMPLEMENTATION.md` để biết thiết kế và API contract ban đầu.
- Giao diện người dùng và admin theo handoff "Sổ lưu bút" (thư mục `design_handoff_luu_but_2010`): giấy kem, polaroid dán băng keo, thư kẻ dòng có tem. Font Itim / Lora / Patrick Hand tự lưu trữ trong `20-10fe/public/fonts` (giấy phép OFL) nên chạy offline và không cần nới CSP.
