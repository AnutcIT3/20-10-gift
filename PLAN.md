# DỰ ÁN: TRANG CHÚC MỪNG 20/10 CHO BẠN NỮ LỚP

Tài liệu thiết kế và quyết định cuối cùng.

---

## 1. Tổng quan

Trang web cá nhân hóa để các bạn nam trong lớp gửi lời chúc nhân ngày Phụ nữ Việt Nam 20/10 đến từng bạn nữ.

- **Đối tượng:** ~20-30 bạn nữ, ~30-40 bạn nam, 1-2 admin
- **Quy mô:** 1 lớp, ~50 người dùng đồng thời
- **Thời gian:** Hoàn thành trước 20/10

---

## 2. UX — Quyết định

- **Concept:** "Lưu bút số" — mỗi bạn nữ có một trang kiểu album thanh xuân. Thiết kế gợi nhớ sổ lưu bút thời đi học: pastel, nét vẽ tay nhẹ, chữ viết tay cho intro.
- **Màu chủ đạo:** Hồng pastel (#FFB6C1) + tím lavender (#E6E6FA) + trắng kem (#FFF8F0)
- **Font:** system-ui cho chính, tùy chọn font serif/SVN cho intro nếu hiển thị tiếng Việt tốt
- **Layout không gian cá nhân:** Cuộn dọc một trang (hero → gallery → letters), music/video Phase 2
- **Âm nhạc:** User chủ động bật/tắt, không auto-play
- **Routing:** `react-router-dom` với:
  - `/` — Landing + form tìm kiếm
  - `/gift/:accessCode` — Không gian cá nhân (deep-link, fetch lại từ URL) 
  - `/admin/login` — Admin login
  - `/admin/*` — Dashboard + CRUD
- **Landing:** Chỉ form tìm tên (không dropdown gợi ý)
- **Effect:** Loading animation "Đang mở quà..." khi vào gift page

---

## 3. Chức năng — MVP scope

### Bắt buộc (MVP)

| Mã | Chức năng | Vai trò |
|----|-----------|---------|
| C01 | Landing + form tìm kiếm | Guest |
| C02 | Truy cập /gift/:accessCode | Guest |
| C03 | Không gian cá nhân cuộn dọc (hero, gallery, letters) | Guest |
| C04 | Xem gallery ảnh (lazy load, lightbox) | Guest |
| C05 | Xem lời chúc (chỉ hiện approved) | Guest |
| C06 | Gửi lời chúc (public) | Guest |
| C07 | Admin login | Admin |
| C08 | Admin CRUD học sinh | Admin |
| C09 | Admin quản lý ảnh (upload, sắp xếp, xóa) | Admin |
| C10 | Admin duyệt/từ chối/xóa lời chúc | Admin |
| C11 | API tìm kiếm học sinh theo tên (normalize + LIKE) | Backend |

### Phase 2 (nếu còn thời gian)

| Mã | Chức năng |
|----|-----------|
| C12 | Music player (MP3 / YouTube) |
| C13 | Video player |
| C14 | Admin quản lý music/video |

---

## 4. Dữ liệu

### Lưu ý về tìm kiếm

DB có cột `normalized_name` (bỏ dấu, lower case, index) được **backend tự sinh** từ `full_name`.
Admin không nhập normalized_name bằng tay.
Khi đổi full_name, backend tự cập nhật normalized_name.

API resolve dùng `WHERE normalized_name LIKE ?` với term đã normalize.
Xử lý được: có dấu/không dấu, hoa/thường, tìm một phần tên.
**Không** xử lý sai chính tả (VD: "Ngyuen" không khớp "Nguyễn").

### access_code

- Backend tự sinh bằng `crypto.randomBytes(9)` → 12 ký tự base64 URL-safe
- Admin không nhập access_code thủ công
- Có endpoint `POST /api/students/:id/rotate-code` để cấp lại
- Mục đích: chống enumeration (không phải xác thực danh tính)
- **Collision handling:** UNIQUE constraint có thể báo trùng (xác suất cực thấp). Service sinh code phải retry tối đa 3 lần nếu gặp duplicate key error
- Vì chức năng resolve vẫn cho phép tìm bằng tên, access_code là rào cản kỹ thuật, không phải bảo mật tuyệt đối

### Schema

#### students
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK AUTO_INCREMENT | |
| full_name | VARCHAR(100) NOT NULL | |
| normalized_name | VARCHAR(100) NOT NULL INDEX | Bỏ dấu, lower case — dùng cho tìm kiếm |
| nickname | VARCHAR(50) | |
| avatar_url | VARCHAR(500) | |
| intro_message | TEXT | |
| access_code | VARCHAR(20) UNIQUE NOT NULL | Admin API trả `giftPath`, không trả raw code ở public API |
| class_name | VARCHAR(20) | DEFAULT 'A1' |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

#### gallery
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| student_id | INT NOT NULL FK → students | ON DELETE CASCADE |
| image_url | VARCHAR(500) NOT NULL | URL từ Cloudinary |
| public_id | VARCHAR(200) | **Để xóa file trên Cloudinary** |
| resource_type | VARCHAR(20) | DEFAULT 'image' |
| caption | TEXT | |
| display_order | INT | DEFAULT 0 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| **INDEX** | (student_id, display_order) | Tối ưu query gallery sorted |

#### letters
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| student_id | INT NOT NULL FK → students | ON DELETE CASCADE |
| sender_name | VARCHAR(100) | NULL nếu ẩn danh |
| title | VARCHAR(200) | |
| content | TEXT NOT NULL | |
| is_anonymous | BOOLEAN | DEFAULT FALSE |
| status | ENUM('pending','approved','rejected') NOT NULL | **DEFAULT 'pending'** |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| **INDEX** | (student_id, status, created_at) | Tối ưu query approved letters |

#### music
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| student_id | INT FK → students | |
| title | VARCHAR(100) | |
| file_url | VARCHAR(500) | |
| public_id | VARCHAR(200) | **Để xóa file** |
| resource_type | VARCHAR(20) | DEFAULT 'video' (Cloudinary dùng video cho audio) |
| source_type | ENUM('upload','youtube') | |
| is_active | BOOLEAN | |

#### videos
| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | |
| student_id | INT FK → students | |
| video_url | VARCHAR(500) | |
| public_id | VARCHAR(200) | |
| resource_type | VARCHAR(20) | DEFAULT 'video' |
| title | VARCHAR(200) | |
| thumbnail_url | VARCHAR(500) | |

#### admins
| Column | Type |
|--------|------|
| id | INT PK |
| username | VARCHAR(50) UNIQUE |
| password_hash | VARCHAR(255) |

---

## 5. Module

| Module | Type | API | Auth |
|--------|------|-----|------|
| Auth | Backend | POST /api/auth/admin/login | Public |
| Resolve | Backend | POST /api/students/resolve (validate, LIMIT, only active) | Public |
| Gift | Backend | GET /api/gifts/:accessCode, /gallery, /letters + POST /letters | Public |
| Student | Backend | CRUD /api/students (admin, trả giftPath, rotate-code) | Admin |
| Gallery Admin | Backend | POST /upload, PUT /reorder, DELETE /:id | Admin |
| Letter Admin | Backend | GET /api/admin/letters?status=pending, PATCH /:id/status, DELETE /:id | Admin |
| Media | Backend | Music + Video CRUD | Admin |
| Landing | Frontend | Form tìm kiếm + resolve → redirect | — |
| GirlSpace | Frontend | Hiển thị nội dung /gift/:accessCode | — |
| Admin | Frontend | Dashboard + CRUD | Login required |

---

## 6. Kiến trúc

SPA (React) + REST API (Express) + MySQL + Cloudinary.

```
Browser (React SPA)
  ├── / → LandingPage → API resolve → redirect /gift/:code
  ├── /gift/:code → GirlSpace → API student + gallery + letters + music + video
  └── /admin/* → AdminLayout (JWT required)

Express API (port 5001)
  ├── /api/health (public)
  ├── /api/ready (public, kiểm tra DB connection)
  ├── /robots.txt (public — chặn search engine)
  ├── /api/auth/* (public — login)
  ├── /api/students/resolve (public — tìm tên → trả giftPath, validate ≥2 ký tự, LIMIT 10)
  ├── /api/students/* (CRUD admin, trả giftPath, authMiddleware built-in)
  ├── /api/gifts/:accessCode/* (public — student info, gallery, letters, POST letters)
  ├── /api/gallery/* (admin — upload/reorder/delete)
  ├── /api/admin/letters?status=pending (admin — list pending, approve/reject)
  ├── /api/letters/* (admin — status change, delete)
  ├── /api/music/* (admin — CRUD)
  └── /api/videos/* (admin — CRUD)
```

---

## 7. Công nghệ

| Thành phần | Lựa chọn |
|-----------|---------|
| Frontend framework | React 19 |
| Build tool | Vite 8 |
| Backend framework | Express.js 4 |
| Database | MySQL 8 |
| Database driver | mysql2 (raw query) |
| Auth | jsonwebtoken + bcryptjs |
| Media storage | Cloudinary + multer-storage-cloudinary |
| Upload | Multer (3 bộ riêng: uploadImage 5MB, uploadAudio 10MB, uploadVideo 50MB) |
| API client FE | Axios |
| Routing FE | react-router-dom |
| Deploy FE | Vercel |
| Deploy BE | Render.com / Railway |
| CSS | Pure CSS (không Tailwind) |
| Dev server | Nodemon |

### Dependencies (Backend)

```
express, mysql2, cors, dotenv, jsonwebtoken, bcryptjs,
cloudinary@^1.x, multer, multer-storage-cloudinary,
express-rate-limit, helmet, compression
+ nodemon (dev)
```

---

## 8. Bảo mật & Quyền riêng tư

- **noindex** — chặn search engine bằng 3 lớp:
  - Header: `X-Robots-Tag: noindex, nofollow, noarchive` (middleware riêng)
  - Frontend: `<meta name="robots" content="noindex,nofollow,noarchive">`
  - `robots.txt`: `User-agent: * / Disallow: /`
- **trust proxy** — `app.set('trust proxy', 1)` cho Render/Railway (reverse proxy). Không set quá rộng
- **access_code** — URL public dùng access_code, không dùng studentId tuần tự (dễ dò)
- **Rate limit** — 100 req/15p general (toàn server), 10 req/15p login. Per-gift limiter (5/accessCode:IP/giờ) dùng key `${accessCode}:${ip}`. Per-gift limiter thay thế publicLimiter cho letter create
- **Honeypot** — form gửi letter có field ẩn `_website` (bot điền → trả fake 201 `{ status: 'pending' }` không có id, không lưu)
- **JWT** — admin token hết hạn 24h, payload tối thiểu: `{ sub: adminId }`. Không nhét username/password vào token
- **Lời chúc** — mặc định `status = 'pending'`, admin phải duyệt mới hiển thị
- **Letter validation** — content: trim, 1–5000 ký tự; title: max 200; sender_name: max 100. Client không được gửi `status` hoặc `student_id`. Nếu `is_anonymous=true`, backend tự set `sender_name=NULL`. Frontend KHÔNG dùng `dangerouslySetInnerHTML` để render letter
- **Upload** — kiểm tra cả file extension VÀ MIME type (double-check), giới hạn kích thước riêng:
  - Ảnh: 5MB (`uploadImage`), Audio: 10MB (`uploadAudio`), Video: 50MB (`uploadVideo`)
  - `uploadErrorHandler` middleware xử lý lỗi: LIMIT_FILE_SIZE → 413, format sai → 400
  - Nếu Cloudinary upload thành công nhưng DB insert lỗi → destroy file trên Cloudinary
- **Xóa media** — lưu `public_id` trong DB để xóa file trên Cloudinary khi cần
  - Khi xóa: gọi `cloudinary.uploader.destroy(public_id)` + DELETE DB
  - Nếu Cloudinary destroy lỗi → vẫn xóa DB (file orphan sẽ được cleanup sau, không block user)

---

## 9. Roadmap

### Sprint 1A — GiftPage prototype (mock data)

| Module | Thời gian |
|--------|-----------|
| Project scaffolding | ✅ Done |
| **GiftPage mock** (hero, gallery, letters với data tĩnh) | **2 ngày** |
| Concept hình ảnh + CSS transitions | 1 ngày |

### Sprint 1B — Public API (chạy song song với 1A)

| Module | Thời gian |
|--------|-----------|
| Auth (login) | 0.5 ngày |
| Resolve + Gift routes + honeypot + per-gift limiter | 1.5 ngày |
| Student CRUD (admin) | 0.5 ngày |
| Gallery upload/reorder/delete | 1 ngày |
| Letter approve/reject + admin pending list | 0.5 ngày |

### Sprint 2 — Kết nối Frontend ↔ Backend

| Module | Thời gian |
|--------|-----------|
| API client (axios instance, repository pattern) | 0.5 ngày |
| Chuyển GiftPage từ mock → API thật | 1 ngày |
| Landing + form tìm kiếm + resolve | 1 ngày |
| Empty states, loading, error, retry | 0.5 ngày |

### Sprint 3 — Admin + hoàn thiện

| Module | Thời gian |
|--------|-----------|
| Admin login + dashboard | 1 ngày |
| Admin CRUD (students, gallery, letters) | 1 ngày |

### Sprint 4 — Deploy + Rehearsal

| Công việc | Thời gian |
|-----------|-----------|
| Deploy BE (Render/Railway) + FE (Vercel) | 1 ngày |
| **Rehearsal:** import học sinh, upload ảnh thật, mở gift link mobile | 1 ngày |
| Export danh sách full_name → giftPath, backup DB | 0.5 ngày |
| Test end-to-end + mobile + duyệt thử lời chúc | 0.5 ngày |

---

## 10. API Contract

### Auth

```
POST /api/auth/admin/login
  Body: { username, password }
  Response 200: { success: true, data: { token } }
  Response 401: { success: false, message: "Invalid credentials" }
```

### Resolve (tìm học sinh để vào gift page)

```
POST /api/students/resolve
  Body: { name: "Nguyễn Thúy Vy" }
  Validation:
    - Trim input
    - Tối thiểu 2 ký tự (sau trim) → 400 nếu ngắn hơn
    - Chuỗi rỗng → 400
    - Chỉ tìm is_active = true
    - Giới hạn tối đa 10 kết quả (LIMIT 10)
  Response 200:
    Tìm thấy 1:
      { success: true, data: { giftPath: "/gift/r7N2pK8vQ4xM" } }
    Nhiều kết quả:
      {
        success: true,
        data: {
          matches: [
            {
              displayName: "Nguyễn Thúy Vy",
              nickname: "Vy",
              avatarUrl: "https://...",
              giftPath: "/gift/r7N2pK8vQ4xM"
            }
          ],
          message: "Có X bạn trùng tên. Chọn bạn cần tìm?"
        }
      }
  Response 400: { success: false, message: "Tên tìm kiếm quá ngắn" }
  Response 404: { success: false, message: "Không tìm thấy" }
```

### Gift routes (public — dùng access_code, KHÔNG dùng studentId)

```
GET /api/gifts/:accessCode
  Response 200: { success: true, data: { full_name, nickname, avatar_url, intro_message } }
  Response 404: { success: false, message: "Not found" }

GET /api/gifts/:accessCode/gallery
  Response 200: { success: true, data: [{ id, image_url, caption, display_order }] }

GET /api/gifts/:accessCode/letters
  Response 200: { success: true, data: [{ id, sender_name, title, content, created_at }] }
  (Chỉ approved)

POST /api/gifts/:accessCode/letters
  Body: {
    sender_name? (max 100 ký tự),
    title? (max 200 ký tự),
    content (required, trim, 1–5000 ký tự),
    is_anonymous? (boolean),
    _website (honeypot — nếu có giá trị → trả fake 201, không lưu)
  }
  Validation: content chỉ whitespace → 400. Client KHÔNG được gửi status hoặc student_id
  Access code inactive/không tồn tại → 404
  Response 201: { success: true, data: { status: 'pending' } }
  Honeypot fake response: { success: true, data: { status: 'pending' } } (không có id)
  (Backend tự tìm student_id từ accessCode, tự gán status = 'pending')
  Rate limit: 5 lần / accessCode:IP / giờ
```

### Students (admin only — tất cả route dùng `router.use(authMiddleware)`)

```
GET /api/students (admin)
  Response 200: { success: true, data: [{ id, full_name, nickname, giftPath, ... }] }
  (Trả giftPath để admin copy/export link. KHÔNG trả raw access_code ở public API)

POST /api/students (admin)
  Body: { full_name, nickname?, avatar_url?, intro_message?, class_name? }
  Response 201: { success: true, data: { id, full_name, giftPath, ... } }
  Backend tự sinh:
    - normalized_name từ full_name
    - access_code ngẫu nhiên 12 ký tự (crypto.randomBytes, retry 3 lần nếu collision)

PUT /api/students/:id (admin)
  Body: { full_name?, nickname?, ... }
  Backend tự cập nhật normalized_name nếu đổi full_name

PATCH /api/students/:id/deactivate (admin)
  Response 200: { success: true, data: { is_active: false } }

POST /api/students/:id/rotate-code (admin)
  Response 200: { success: true, data: { giftPath: "/gift/..." } }
  (Code cũ hết hiệu lực ngay lập tức)
```

### Gallery

```
GET /api/admin/students/:studentId/gallery (admin)
  Response 200: { success: true, data: [{ id, image_url, caption, display_order }] }
  (Admin cần endpoint riêng để tải gallery theo student ID)

POST /api/gallery/upload (admin, multipart)
  Fields: student_id, caption?, image (file)
  Response 201: { success: true, data: { id, image_url, public_id } }
  Lưu ý: nếu Cloudinary upload OK nhưng DB insert lỗi → destroy file trên Cloudinary

PUT /api/gallery/reorder (admin)
  Body: { items: [{ id, display_order }] }
  Service: chạy transaction, kiểm tra ID tồn tại + cùng student, rollback nếu lỗi

DELETE /api/gallery/:id (admin)
  Response 200: { success: true, data: {} }
  Xóa Cloudinary file + DB. Nếu Cloudinary destroy lỗi → vẫn xóa DB (orphan cleanup sau)
```

### Letters (admin)

```
GET /api/admin/letters?status=pending&studentId=&page=1&pageSize=20 (admin)
  Response 200:
  {
    success: true,
    data: {
      items: [
        { id, student_name, sender_name, content, status, created_at }
      ],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }
    }
  }
  (Admin cần endpoint riêng để xem danh sách pending + paginated)

PATCH /api/letters/:id/status (admin)
  Body: { status: 'approved' | 'rejected' }
  Response 200: { success: true }

DELETE /api/letters/:id (admin)
```

### Music (admin)

```
POST /api/music (admin, YouTube link)
  Body: { student_id, title, file_url, source_type: 'youtube' }
POST /api/music/upload (admin, file)
DELETE /api/music/:id (admin)
```

### Videos (admin)

```
POST /api/videos (admin, YouTube link)
POST /api/videos/upload (admin, file)
DELETE /api/videos/:id (admin)
```

---

## 11. Kiểm thử

Mỗi module backend phải có:

- **API contract test:** Gọi từng endpoint, kiểm tra status code + response shape
- **Auth test:** Route admin không có token → 401. Token hết hạn → 401. Token sai chữ ký → 401
- **Validation test:** Input thiếu/sai → 400. Content chỉ whitespace → 400. Content > 5000 ký tự → 400
- **Edge case test:**
  - Student không active → toàn bộ Gift routes trả 404
  - Access code không tồn tại → 404
  - Gallery rỗng → []
  - Letter status pending → không hiện ở public GET
  - Public POST cố gửi `status: approved` → vẫn pending
  - Public POST cố gửi `student_id` → bị bỏ qua
  - Anonymous letter không lộ `sender_name` ở public response
  - Rotate code → code cũ trả 404
  - Collision khi sinh code → retry thành công
  - Honeypot `_website` có giá trị → fake 201, không insert DB
  - Per-gift rate limit quá 5 lần/h → 429
  - Resolve input < 2 ký tự → 400
  - Resolve input rỗng → 400
  - Reorder gallery với ID sai → rollback toàn bộ
  - Upload thành công Cloudinary nhưng DB lỗi → destroy file
  - Admin list pending letters
  - CORS từ origin không hợp lệ → blocked

Frontend:

- Responsive test (320px - 1920px)
- Deep-link: `/gift/:code` fetch đúng data kể cả refresh
- Upload lỗi hiển thị toast
- Lazy load ảnh hoạt động
- XSS payload hiển thị dưới dạng text (không render HTML)
- Keyboard: lightbox Escape đóng, focus trap
- Mobile mạng chậm + ảnh lỗi có fallback

---

## 12. Rehearsal trước ngày phát hành

- Import toàn bộ học sinh
- Upload ít nhất 1 ảnh thật cho mỗi người
- Mở tất cả gift link trên mobile
- Gửi và duyệt thử lời chúc
- Export danh sách `full_name → giftPath`
- Backup DB trước ngày phát hành
