# IMPLEMENTATION PLAN

> Kế hoạch lập trình chi tiết — ưu tiên **GirlSpace frontend** > API backend > Admin.
> Làm frontend với mock data song song với backend, không chờ API.
> Mỗi Task làm từng cái một, có phê duyệt trước khi code.

---

## Module 0: Project Scaffolding

---

### Bước 1: Mục tiêu

Thiết lập toàn bộ hạ tầng backend để các module sau có thể bắt đầu code ngay mà không cần chờ đợi.

**Giá trị mang lại:**
- Có server chạy được ngay (port 5001)
- Có kết nối MySQL sẵn sàng
- Có cấu hình Cloudinary sẵn sàng
- Các module sau chỉ việc thêm route + controller + service mà không cần config lại
- Migration tự động — chạy bằng npm script

**Vai trò trong hệ thống:** Nền tảng cho tất cả module backend. Không module nào hoạt động được nếu thiếu Module 0.

---

### Bước 2: Phạm vi

**Bao gồm:**

| # | Feature | Bắt buộc? |
|---|---------|-----------|
| F0.1 | Khởi tạo project (package.json, .gitignore) | ✅ Bắt buộc |
| F0.2 | Config Constants (constants.js) | ✅ Bắt buộc |
| F0.3 | Config DB (db.js - MySQL pool) | ✅ Bắt buộc |
| F0.4 | Config Cloudinary (cloudinary.js) | ✅ Bắt buộc |
| F0.5 | Utils (normalizeName, response, jwt) | ✅ Bắt buộc |
| F0.6 | Middleware (errorHandler, rateLimit, auth, upload) | ✅ Bắt buộc |
| F0.7 | Migrations (SQL + migrate script) | ✅ Bắt buộc |
| F0.8 | Server entry point (server.js + health check) | ✅ Bắt buộc |

**Không bao gồm:**
- Bất kỳ route/controller/service nào của module nghiệp vụ

---

### Bước 3: Technical Specification

#### F0.1 — Khởi tạo project

**Đầu vào:** Danh sách dependencies từ PLAN.md Giai Đoạn 7.

**package.json scripts:**
```json
{
  "dev": "nodemon server.js",
  "start": "node server.js",
  "migrate": "node scripts/migrate.js"
}
```

**Luồng:** `npm install` → cài tất cả dependencies.

---

#### F0.2 — Config Constants

**File:** `config/constants.js`

```js
MAX_IMAGE_SIZE: 5 * 1024 * 1024,
MAX_AUDIO_SIZE: 10 * 1024 * 1024,
MAX_VIDEO_SIZE: 50 * 1024 * 1024,
ALLOWED_IMAGE_TYPES: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
ALLOWED_AUDIO_TYPES: ['mp3', 'wav'],
ALLOWED_VIDEO_TYPES: ['mp4', 'webm'],
```

---

#### F0.3 — Config DB

**File:** `config/db.js`

**Chức năng:** Tạo MySQL connection pool từ env variables.

**Đầu vào:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` từ `.env`

**Đầu ra:** Pool object export — `pool.execute(query, params)`.

**Edge cases:**
- Thiếu env → throw "Missing DB env: DB_HOST"
- Pool lỗi kết nối → lỗi xuất hiện khi query (connection timeout)

---

#### F0.4 — Config Cloudinary

**File:** `config/cloudinary.js`

**Chức năng:** Cấu hình Cloudinary SDK + 3 bộ Multer upload riêng biệt.

**Đầu ra:**
- `cloudinary` — configured instance
- `uploadImage` — Multer middleware cho ảnh (5MB, resource_type: image)
- `uploadAudio` — Multer middleware cho nhạc (10MB, resource_type: video)
- `uploadVideo` — Multer middleware cho video (50MB, resource_type: video)
- `uploadErrorHandler` — middleware xử lý lỗi upload (LIMIT_FILE_SIZE → 413, format sai → 400)

**Validation:**
- Kiểm tra cả file extension VÀ MIME type (double check)
- MIME map: `image/*` → resource_type 'image', `audio/*` + `video/*` → resource_type 'video'
- File sai format → 400 "Invalid file format"
- File sai MIME type → 400 "Invalid MIME type: ..."
- File quá lớn → 413 "File too large"

---

#### F0.5 — Utils

**normalizeName.js:**
- Input: string (tên tiếng Việt có dấu)
- Output: lowercase, bỏ dấu, `đ` → `d`, trim
- Logic: `NFD normalize → remove diacritics → replace đ → trim → toLowerCase`

**response.js:**
- `sendSuccess(res, data, statusCode=200)` → `{ success: true, data }`
- `sendError(res, message, statusCode=400)` → `{ success: false, message }`
- `asyncHandler(fn)` → wrap async handler, catch → next(err)

**jwt.js:**
- `signToken(payload)` → JWT string (expiresIn từ env, default 24h)
- `verifyToken(token)` → decoded payload hoặc throw error
- **Không** chứa authMiddleware — middleware được tách riêng ở `middleware/auth.js`

---

#### F0.6 — Middleware

**errorHandler.js:**
- Catch error từ `next(err)`
- Trả JSON: `{ success: false, message: err.message }`
- Nếu NODE_ENV === 'development' → include stack trace
- Log lỗi ra console

**rateLimit.js:**
- `generalLimiter`: 100 requests / 15 phút
- `authLimiter`: 10 requests / 15 phút (cho login)
- `publicLimiter`: 50 requests / 15 phút (cho letter create)

**auth.js:**
- Import `verifyToken` từ `utils/jwt.js`
- Kiểm tra `Authorization: Bearer <token>` header
- Nếu thiếu/ sai → `sendError(res, 'Unauthorized', 401)`
- Nếu OK → `req.admin = decoded` → `next()`

**upload.js:**
- Re-export `uploadImage`, `uploadAudio`, `uploadVideo`, `uploadErrorHandler` từ cloudinary config
- Các module sau import từ đây thay vì trực tiếp từ cloudinary.js

---

#### F0.7 — Migrations

**001_create_tables.sql:**
- 6 bảng: students, admins, gallery, letters, music, videos
- Đầy đủ columns + foreign keys (ON DELETE CASCADE)
- `IF NOT EXISTS`
- `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

**002_seed_data.sql:**
- 2-3 sample students (normalized_name, access_code)
- 1-2 sample letters (pending/approved)

**scripts/migrate.js:**
- Tạo connection riêng (không dùng pool) với `multipleStatements: true` (an toàn vì SQL là file nội bộ)
- Tạo bảng `schema_migrations` để theo dõi migration đã chạy
- Đọc danh sách file `.sql` theo thứ tự
- Với mỗi file chưa chạy:
  - Đọc nội dung SQL bằng `fs`
  - Chạy toàn bộ file bằng `connection.query(sql)` (multipleStatements xử lý nhiều câu lệnh)
  - Ghi filename vào `schema_migrations`
- File đã chạy rồi → skip, log "already applied"
- Chạy lại lần 2 → không lỗi, không trùng lặp (idempotent)
- Nếu lỗi → log lỗi + exit code 1
- Luôn đóng connection trong `finally`

---

#### F0.8 — Server entry point

**server.js** — Làm cuối cùng, import tất cả các thành phần trên.

**Cần:**
- Import express, cors, helmet, compression, dotenv
- Import db (gọi pool để khởi tạo connection)
- Import rateLimit, errorHandler
- Import auth middleware (chưa dùng ngay, nhưng sẵn sàng)
- Import upload middleware
- CORS config động:

```js
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
```

- Middleware thứ tự: `app.set('trust proxy', 1) → helmet() → X-Robots-Tag → cors() → compression() → express.json() → generalLimiter → routes → errorHandler`
- Route `/api/health` → `{ status: "ok", timestamp }`
- Route `/api/ready` → test DB connection (`pool.query('SELECT 1')`) → `{ status: "ready", db: "connected" }` hoặc 503
- `.env` dùng `FRONTEND_URL` (không phải `CLIENT_URL`) cho CORS
- Listen PORT từ env (fallback 5001)

---

### Bước 4: Chia thành Features

```
Module 0: Project Scaffolding
│
├── F0.1: Khởi tạo project (package.json, .gitignore, npm install)
├── F0.2: Config Constants (constants.js)
├── F0.3: Config DB (db.js)
├── F0.4: Config Cloudinary (cloudinary.js)
├── F0.5: Utils (normalizeName, response, jwt)
├── F0.6: Middleware (errorHandler, rateLimit, auth, upload)
├── F0.7: Migrations (SQL files + migrate script)
└── F0.8: Server entry point (server.js)
```

---

### Bước 5: Chia Feature thành Task

#### F0.1 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 0.1.1 | Tạo `package.json` với đầy đủ dependencies | Không |
| 0.1.2 | Tạo `.gitignore` cho backend | Không |
| 0.1.3 | Chạy `npm install` | 0.1.1 |

#### F0.2 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 0.2.1 | Tạo `config/constants.js` | 0.1.3 |

#### F0.3 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 0.3.1 | Tạo `config/db.js` — MySQL pool | 0.1.3 |

#### F0.4 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 0.4.1 | Tạo `config/cloudinary.js` — Cloudinary + Multer | 0.1.3 |

#### F0.5 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 0.5.1 | Tạo `utils/normalizeName.js` | Không |
| 0.5.2 | Tạo `utils/response.js` | Không |
| 0.5.3 | Tạo `utils/jwt.js` (signToken, verifyToken — **không** authMiddleware) | 0.1.3 |

#### F0.6 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 0.6.1 | Tạo `middleware/errorHandler.js` | 0.5.2 |
| 0.6.2 | Tạo `middleware/rateLimit.js` | 0.1.3 |
| 0.6.3 | Tạo `middleware/auth.js` (authMiddleware) | 0.5.3 |
| 0.6.4 | Tạo `middleware/upload.js` | 0.4.1 |

#### F0.7 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 0.7.1 | Tạo `migrations/001_create_tables.sql` | Không |
| 0.7.2 | Tạo `migrations/002_seed_data.sql` | 0.7.1 |
| 0.7.3 | Tạo `scripts/migrate.js` — tự động chạy migration | 0.3.1 |

#### F0.8 → Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| **0.8.1** | Tạo `server.js` — import tất cả, CORS động, trust proxy, X-Robots-Tag, health check, robots.txt, errorHandler | 0.1.3, 0.2.1, 0.3.1, 0.4.1, 0.5.1, 0.5.2, 0.5.3, 0.6.1, 0.6.2, 0.6.3, 0.6.4, 0.7.3 |
| **0.8.2** | Tạo `public/robots.txt` cho frontend + `<meta robots>` trong `index.html` | — |
| **0.8.3** | Kiểm tra: start server → `/api/health` OK → `/robots.txt` trả nội dung | 0.8.1 |

---

### Bước 6: Thứ tự thực hiện (Bottom-up)

```
Tầng 1: Nền tảng
0.1.1 ──→ 0.1.2 ──→ 0.1.3 (npm install)
                            │
Tầng 2: Config (độc lập)    │
┌────────────────────────────┤
▼                            ▼
0.2.1 (constants)       0.3.1 (db)
                             │
▼                             ▼
0.4.1 (cloudinary)      0.7.3 (migrate script — cần db)
                             │
Tầng 3: Utils (độc lập)      │
▼           ▼            ▼
0.5.1      0.5.2        0.5.3 (jwt)
(normalize) (response)     │
   │           │            │
Tầng 4: Middleware           │
   ▼           ▼            ▼
             0.6.1        0.6.3
          (errorHandler)  (auth — cần jwt)
                             │
             0.6.2           │
          (rateLimit)        │
                             │
             0.6.4           │
           (upload — cần    │
           cloudinary)       │
                             │
Tầng 5: SQL                   │
▼           ▼                │
0.7.1      0.7.2             │
(001.sql)  (002.sql)         │
                             │
Tầng 6: Gắn kết — server.js làm cuối
▼
0.8.1 ──→ 0.8.2 ──→ 0.8.3
(server.js)  (robots.txt+meta)  (kiểm tra health+robots)
```

**Giải thích:**
- **Tầng 1:** Project init — không gì làm được nếu thiếu
- **Tầng 2:** Config độc lập — constants, db, cloudinary
- **Tầng 3:** Utils — normalizeName và response không phụ thuộc gì, jwt cần package
- **Tầng 4:** Middleware — errorHandler cần response util, auth cần jwt util, upload cần cloudinary config
- **Tầng 5:** SQL files + migrate script — migrate script cần db
- **Tầng 6:** server.js — import tất cả, chỉ viết 1 lần duy nhất

---

### Bước 7: Tiêu chí hoàn thành từng Task

| Task | Mục tiêu | Kết quả mong muốn | Điều kiện hoàn thành |
|------|----------|-------------------|---------------------|
| **0.1.1** | Tạo package.json | File đúng dependencies | `npm install` chạy không lỗi |
| **0.1.2** | Tạo .gitignore | node_modules + .env bị ignore | `git status` không hiện node_modules |
| **0.1.3** | Cài dependencies | node_modules đầy đủ | `node -e "require('express')"` không lỗi |
| **0.2.1** | constants.js | Export đúng hằng số | `node -e "require('./config/constants')"` không lỗi |
| **0.3.1** | db.js | Pool sẵn sàng | Import không lỗi |
| **0.4.1** | cloudinary.js | Instance sẵn sàng | Import không lỗi |
| **0.5.1** | normalizeName.js | "Nguyễn Thúy Vy" → "nguyen thuy vy" | Gọi hàm với input mẫu → đúng output |
| **0.5.2** | response.js | sendSuccess/sendError trả đúng format | Gọi hàm → JSON đúng cấu trúc |
| **0.5.3** | jwt.js | sign + verify hoạt động | sign token → verify lại → đúng payload |
| **0.6.1** | errorHandler.js | Bắt lỗi → JSON response | next(Error) → response đúng format |
| **0.6.2** | rateLimit.js | 3 rate limiter export được | Import + gọi từng cái không lỗi |
| **0.6.3** | auth.js | Từ chối request không có token | Gọi middleware với req thiếu auth → 401 |
| **0.6.4** | upload.js | 4 exports sẵn sàng (uploadImage, uploadAudio, uploadVideo, uploadErrorHandler) | Import không lỗi |
| **0.7.1** | 001_create_tables.sql | 6 bảng với FK + normalized_name INDEX | Chạy SQL vào MySQL không lỗi |
| **0.7.2** | 002_seed_data.sql | Data mẫu (ON DUPLICATE KEY UPDATE) | Chạy SQL không lỗi, re-run an toàn |
| **0.7.3** | scripts/migrate.js | Migration idempotent + schema_migrations tracking | `npm run migrate` lần 1 tạo bảng, lần 2 skip |
| **0.8.1** | server.js | Server start port 5001 + trust proxy + X-Robots-Tag + /robots.txt route | `node server.js` → "Server running on port 5001" |
| **0.8.2** | Frontend noindex | `<meta robots>` + `public/robots.txt` | Trình duyệt tải robots.txt |
| **0.8.3** | Health + Ready check | /api/health + /api/ready trả JSON | health → `{"status":"ok"}`, ready → `{"status":"ready","db":"connected"}` |

---

### Bước 8: Chờ phê duyệt

**Module 0** có tổng cộng **19 tasks** (0.1.1 → 0.8.3).

Sau khi hoàn thành:
- Server chạy `localhost:5001`, `/api/health` + `/api/ready` OK
- MySQL pool sẵn sàng
- Cloudinary config: 3 bộ upload riêng (image/audio/video) + uploadErrorHandler
- Migration idempotent bằng `npm run migrate` (schema_migrations tracking)
- CORS cấu hình động (FRONTEND_URL)
- authMiddleware tách riêng ở `middleware/auth.js`
- `utils/jwt.js` chỉ chứa sign/verify thuần túy
- `app.set('trust proxy', 1)` cho reverse proxy (Render/Railway)
- `helmet()` + `X-Robots-Tag: noindex, nofollow, noarchive` middleware
- `GET /robots.txt` → `User-agent: * / Disallow: /`
- Frontend: `<meta name="robots" content="noindex,nofollow,noarchive">` + `public/robots.txt`

---

> ✅ **Module 0 hoàn thành.** Server chạy, `/api/health` + `/api/ready` OK.

---

## Module 1: Frontend — Prototype GiftPage với Mock Data

### Mục tiêu

Xây dựng giao diện GiftPage (hero → gallery → letters) với mock data trước.
Không chờ API backend. Dùng data JSON tĩnh để test responsive, animation, layout.

**Giá trị mang lại:**
- Giao diện là thứ người dùng cuối thấy — cần hoàn thiện sớm nhất
- Phát hiện vấn đề UX/layout ngay, không chờ API xong mới sửa
- Concept hình ảnh + cảm xúc được ưu tiên
- CSS transitions, loading state, empty state được test real

### Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 1.1 | Tạo `src/data/mock.js` — mock student, gallery ảnh, letters | — |
| 1.2 | Tạo `src/api/giftRepository.js` — abstraction layer (mock adapter mặc định, HTTP adapter sau) | — |
| 1.3 | Tạo `HeroSection.jsx` — avatar + tên + intro + hiệu ứng mở quà | — |
| 1.4 | Tạo `PhotoGallery.jsx` — grid masonry + lightbox + lazy load | — |
| 1.5 | Tạo `LetterSection.jsx` — danh sách lời chúc dạng trang lưu bút + form gửi | — |
| 1.6 | Tạo `GiftPage.jsx` — ghép sections + loading state + empty state | 1.3-1.5 |
| 1.7 | Tạo `EmptyState.jsx` — component thông báo "chưa có ảnh/lời chúc" | — |
| 1.8 | Concept visual: phong cách lưu bút số | — |

### Kiểm thử

- [ ] HeroSection hiển thị avatar, tên, intro
- [ ] PhotoGallery lazy load hoạt động (scroll)
- [ ] Lightbox mở/đóng ảnh, Escape đóng, focus trap
- [ ] LetterSection hiển thị approved letters + form gửi
- [ ] Form gửi letter validate: content required, trim, 1–5000 ký tự
- [ ] EmptyState hiển thị khi không có ảnh hoặc không có letter
- [ ] Responsive 320px → 1920px
- [ ] Refresh /gift/:code không mất state
- [ ] XSS payload hiển thị dưới dạng text thuần (không render HTML)
- [ ] Mobile mạng chậm + ảnh lỗi có fallback

### Concept "Lưu bút số" (bắt buộc)

- Màu sắc: Hồng pastel (#FFB6C1), tím lavender (#E6E6FA), trắng kem (#FFF8F0)
- Font: system-ui cho nội dung, cursive/handwriting cho intro
- Hiệu ứng: fade-in khi scroll, "Đang mở quà..." loading
- Hero: gradient background + avatar bo tròn + tên to + intro mềm mại
- **Gallery: caption ảnh giống ghi chú dán (sticky note style)**
- **Letters: card giống trang giấy lưu bút (texture giấy, viền nhẹ, có ngày tháng)**
- **Nét vẽ tay chỉ dùng trang trí (border, divider), không dùng cho nội dung dài**
- Empty state: icon + text nhẹ nhàng "Chưa có lời chúc nào..."

### API Abstraction (thiết kế từ đầu)

```js
// src/api/giftRepository.js
const giftRepository =
  import.meta.env.VITE_USE_MOCK === 'true'
    ? mockGiftRepository   // dùng data từ mock.js
    : httpGiftRepository;  // dùng axios gọi API thật

export default giftRepository;
// Khi chuyển sang API thật, chỉ cần đổi env, không sửa component
```

---

## Module 2: Backend — API Gift + Resolve

### Mục tiêu

Xây dựng API công khai (guest-facing) trước: resolve, gift info, gallery, letters.
Admin API làm sau.

### API contract

Xem PLAN.md — mục 10 (ưu tiên: Resolve → Gift routes → Gallery POST → Letter POST → Approve).

### Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 2.1 | Tạo `routes/gifts.js` — GET /api/gifts/:accessCode, /gallery, /letters | Module 0 |
| 2.2 | Tạo `routes/resolve.js` — POST /api/students/resolve (normalized_name LIKE) | Module 0 |
| 2.3 | Tạo `controllers/giftController.js` | 2.1 |
| 2.4 | Tạo `controllers/resolveController.js` — validate input ≥ 2 ký tự, LIMIT 10 | 2.2 |
| 2.5 | Tạo `services/giftService.js` — get student by code (is_active=true), get gallery, get approved letters | 2.3 |
| 2.6 | Tạo `services/resolveService.js` — normalize input, LIKE normalized_name, handle multi-match, LIMIT 10 | 2.4 |
| 2.7 | Tạo `middleware/honeypot.js` — _website field check, trả fake 201 không có id | Module 0 |
| 2.8 | Tạo `middleware/perGiftLimiter.js` — rate limit 5/accessCode:IP/giờ | Module 0 |
| 2.9 | **POST /api/gifts/:accessCode/letters** — route + controller + service + gắn honeypot + perGiftLimiter | 2.1, 2.7, 2.8 |
| 2.10 | **createLetter service** — validate content (trim, 1–5000), lấy student_id từ accessCode, insert status='pending' | 2.9 |

### Lưu ý

- Resolve: trim input, tối thiểu 2 ký tự → 400 nếu ngắn hơn, chuỗi rỗng → 400, chỉ tìm is_active=true, LIMIT 10
- Resolve multi-match: trả `matches[]` với `{ displayName, nickname, avatarUrl, giftPath }`
- Letter validation: content trim 1–5000, title max 200, sender_name max 100. Client KHÔNG được gửi `status` hoặc `student_id`
- Honeypot: nếu `_website` có giá trị → trả fake 201 `{ status: 'pending' }` (không có id), không insert DB
- Per-gift limiter: dùng `rateLimit({ keyGenerator: req => req.params.accessCode + ':' + req.ip })`
- Access code inactive/không tồn tại → 404

---

## Module 3: Backend — Admin Core (Auth + Student CRUD)

### Mục tiêu

Admin login, JWT middleware, CRUD học sinh. Các module admin khác phụ thuộc module này.

### API contract

Xem PLAN.md — mục 10 (Auth + Students).

### Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 3.1 | Tạo `routes/auth.js` — POST /api/auth/admin/login | Module 0 |
| 3.2 | Tạo `controllers/authController.js` | 3.1 |
| 3.3 | Tạo `services/authService.js` — tìm admin, so sánh bcrypt, sign JWT `{ sub: adminId }` | 3.2 |
| 3.4 | Tạo `scripts/create-admin.js` — đọc ADMIN_USERNAME/PASSWORD từ env, hash + insert | Module 0 |
| 3.5 | Tạo `routes/students.js` — `router.use(authMiddleware)` + GET/POST/PUT + deactivate + rotate-code | Module 0 |
| 3.6 | Tạo `controllers/studentController.js` — GET trả giftPath cho admin | 3.5 |
| 3.7 | Tạo `services/studentService.js` — CRUD + auto normalized_name + auto access_code (retry 3 lần collision) | 3.6 |

### Lưu ý

- **Admin bootstrap:** Không seed admin/admin123. Dùng `npm run create-admin` đọc env `ADMIN_USERNAME` + `ADMIN_PASSWORD`, hash rồi insert. Production thiếu env → không tạo admin mặc định
- normalized_name: backend tự sinh từ full_name (dùng utils/normalizeName.js)
- access_code: `crypto.randomBytes(9).toString('base64url')` — 12 ký tự, retry 3 lần nếu UNIQUE collision
- rotate-code: sinh code mới, update DB, trả giftPath mới. Code cũ hết hiệu lực ngay
- JWT payload tối thiểu: `{ sub: adminId }`. Không nhét username/password vào token
- Tất cả route admin dùng `router.use(authMiddleware)` trước toàn bộ CRUD
- GET /api/students trả `giftPath` để admin copy/export link

### Kiểm thử

- [ ] Login đúng → trả token
- [ ] Login sai → 401
- [ ] Thiếu field → 400
- [ ] GET /api/students (no token) → 401
- [ ] POST /api/students (valid token) → 201, normalized_name + access_code tự sinh
- [ ] PUT /api/students/:id → updated normalized_name nếu đổi tên
- [ ] PATCH deactivate → is_active = false
- [ ] POST rotate-code → access_code mới

---

## Module 4: Backend — Gallery Upload + Letter Approve

### Mục tiêu

Admin upload ảnh, duyệt/từ chối lời chúc.

### Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 4.1 | Tạo `routes/gallery-admin.js` — GET /api/admin/students/:studentId/gallery, POST /upload, PUT /reorder, DELETE /:id | Module 3 |
| 4.2 | Tạo `controllers/galleryController.js` — upload: nếu DB lỗi → destroy Cloudinary file | 4.1 |
| 4.3 | Tạo `services/galleryService.js` — reorder chạy trong transaction, kiểm tra ID tồn tại + cùng student | 4.2 |
| 4.4 | Tạo `routes/letters-admin.js` — **GET /api/admin/letters?status=pending** + PATCH /:id/status + DELETE /:id | Module 3 |
| 4.5 | Tạo `controllers/letterController.js` — admin list pending, approve/reject | 4.4 |
| 4.6 | Tạo `services/letterService.js` — query letters by status/studentId, paginated | 4.5 |

### Lưu ý reorder gallery

- Chạy trong MySQL transaction
- Kiểm tra tất cả ID tồn tại và thuộc cùng 1 student
- Từ chối ID trùng
- Rollback toàn bộ nếu 1 item lỗi

---

## Module 5: Frontend — Admin Dashboard

### Mục tiêu

Admin login + CRUD học sinh + gallery manager + letter duyệt.

### Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 5.1 | Tạo `LoginPage.jsx` — form login, lưu JWT | Module 3 |
| 5.2 | Tạo `Dashboard.jsx` — tổng quan | 5.1 |
| 5.3 | Tạo `StudentManager.jsx` — CRUD học sinh | Module 3 |
| 5.4 | Tạo `GalleryManager.jsx` — upload + sắp xếp | Module 4 |
| 5.5 | Tạo `LetterManager.jsx` — duyệt/từ chối/xóa | Module 4 |

---

## Module 6: Frontend — API Integration (Mock → API)

### Mục tiêu

Kết nối GiftPage với API thật. Landing + resolve, axios instance, httpRepository, loading/error/retry.

### Tasks

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| 6.1 | Tạo `src/services/api.js` — axios instance (baseURL từ env, timeout) | Module 2 |
| 6.2 | Tạo `src/api/httpGiftRepository.js` — resolveStudent(), getGift(), getGallery(), getLetters(), createLetter() | Module 2, 6.1 |
| 6.3 | Tạo `LandingPage.jsx` — form + resolve call + loading/error state + redirect /gift/:code | 6.2 |
| 6.4 | Chuyển `GiftPage.jsx` từ mock sang API: đổi env `VITE_USE_MOCK=false`, dùng httpGiftRepository | 6.2 |
| 6.5 | Loading state (skeleton), error state (retry button), offline fallback | 6.4 |
| 6.6 | Test full flow: Landing → resolve → GiftPage → letters POST → refresh deep-link | 6.5 |

### Cơ chế mock ↔ API

```js
// Từ Module 1 — không sửa component
const giftRepository =
  import.meta.env.VITE_USE_MOCK === 'true'
    ? mockGiftRepository
    : httpGiftRepository;
```

### Kiểm thử

- [ ] Landing: input rỗng → validation, input < 2 ký tự → error, resolve 1 → redirect, resolve nhiều → chọn
- [ ] GiftPage: load student info → gallery → letters
- [ ] POST letter: success → loading → success state
- [ ] Error: API fail → retry button
- [ ] Deep-link: refresh /gift/:code → fetch lại đúng

---

## Test Strategy

### Unit test (backend)

- `normalizeName()` — input "Nguyễn Thúy Vy" → output "nguyen thuy vy"
- `signToken` + `verifyToken` — sign → verify → đúng payload
- `sendSuccess`/`sendError` — response đúng shape

### Integration test (backend)

- Resolve: input "Nguyễn Thúy Vy" → giftPath, "Nguyễn" → nhiều matches, "xyz" → 404
- Resolve: input < 2 ký tự → 400, chuỗi rỗng → 400
- Gift: accessCode hợp lệ → student info, gallery → array, letters → chỉ approved
- Gift: accessCode không tồn tại → 404, student inactive → 404
- Letter POST: pending, có _website → fake 201 không insert, quá 5 lần/h → 429
- Letter POST: cố gửi `status: approved` → vẫn pending, cố gửi `student_id` → bị bỏ qua
- Letter POST: content chỉ whitespace → 400, content > 5000 → 400
- Letter: anonymous không lộ sender_name ở public response
- Auth: login đúng → token, sai → 401, token hết hạn → 401, token sai chữ ký → 401
- Admin: route không token → 401, GET students trả giftPath
- Admin: `GET /api/admin/students/:studentId/gallery` → array ảnh
- Rotate code → code cũ trả 404, collision sinh code → retry thành công
- Gallery: reorder với ID sai → rollback, upload thành công Cloudinary nhưng DB lỗi → destroy file
- Admin: GET /api/admin/letters?status=pending hoạt động
- CORS từ origin không hợp lệ → blocked

### E2E test (frontend)

- Mở / → nhập tên → resolve → redirect /gift/:code
- Deep-link: mở /gift/:code trực tiếp → fetch API → hiển thị đúng
- Ảnh load khi scroll (lazy load)
- Form gửi letter: thiếu content → validation error
- Honeypot field: bot điền _website → fake success
- Responsive: 320px, 768px, 1280px
- XSS payload hiển thị dưới dạng text
- Lightbox: Escape đóng, focus trap, keyboard navigation
- Mobile mạng chậm + ảnh lỗi có fallback

### Migration test

- Chạy `npm run migrate` trên DB mới → schema_migrations + 6 bảng được tạo
- Chạy lần 2 → báo "already applied", không lỗi
- Chạy trên DB đã có data → không mất dữ liệu

---

## MVP cắt giảm

Nếu không kịp deadline, cắt theo thứ tự:

1. ❌ Video (phase 2)
2. ❌ Music (phase 2)
3. ❌ Admin gallery drag-drop reorder (giữ form đơn giản)
4. ❌ Admin dashboard tổng quan
5. ❌ Student CRUD (admin) — insert trực tiếp qua DB hoặc seed
6. ⚠️ Admin chỉ có login + letter approve (bỏ gallery manager, student manager)

**MVP tối thiểu:** Landing lookup + resolve → GiftPage (hero + gallery + letters) + Admin login + approve letters.

**Thứ tự triển khai:**

1. Prototype GiftPage bằng mock data (Module 1)
2. Gift GET API + resolve (Module 2)
3. Public letter POST bằng access code + honeypot + limiter (Module 2)
4. Admin auth + JWT + Student CRUD (Module 3)
5. Approve/reject letter (Module 4)
6. Gallery upload + admin gallery GET (Module 4)
7. **Frontend API Integration** — LandingPage, resolve, axios, httpRepo, chuyển mock→API (Module 6)
8. Admin Dashboard Frontend (Module 5)
9. Music/video cuối cùng
