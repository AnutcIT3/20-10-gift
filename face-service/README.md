# face-service

Dịch vụ trích đặc trưng khuôn mặt cho Face ID, chạy nội bộ trên
`127.0.0.1:5002`. Nó chỉ làm một việc: nhận ảnh → trả về các khuôn mặt kèm vector
512 chiều và chỉ số chất lượng. So khớp với hồ sơ, ngưỡng, rate limit, công tắc
bật/tắt… nằm ở backend Node (`20-10be`), nơi đã có database và cấu hình. Nhờ vậy
service không cần mật khẩu database, không giữ trạng thái, và một lỗi ở đây chỉ
làm thẻ Face ID tự ẩn chứ không làm sập web.

Thư mục này còn chứa bộ benchmark chọn model (giai đoạn 1, xem phần cuối) và
kết quả đo trong [RESULTS.md](RESULTS.md): chọn **ArcFace w600k_r50**, đăng ký
kiểu `mean`, ngưỡng τ = 0,45 kèm margin ≥ 0,10.

## Cài đặt

Cần Python 3.11. `setup-local.bat` ở thư mục gốc tự làm bước này nếu máy có
`py -3.11`; làm tay thì:

```
cd face-service
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`onnxruntime` bản CPU là đủ (20 ms/ảnh với model đã chọn). Model `buffalo_l`
được insightface tải về `~/.insightface/models/` ở lần chạy đầu — cần mạng một
lần. `.venv/` và `models/` đều nằm trong `.gitignore`.

## Chạy service

```
face-service\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 5002
```

Bình thường không cần gõ lệnh này: `start-dev.bat` mở nó trong cửa sổ thứ ba
khi thấy `.venv`, còn `start-public.bat` chạy ẩn và chờ `/health` tối đa 60 giây
trước khi mở tunnel. Chỉ bind `127.0.0.1`, nghĩa là chỉ backend Node trên cùng
máy gọi được; không bao giờ mở ra mạng.

Biến môi trường tùy chọn: `FACE_MAX_UPLOAD_BYTES` (mặc định 8 MB),
`FACE_MAX_FACES` (mặc định 5), `FACE_GPU=1` để dùng GPU (cần
`onnxruntime-gpu>=1.27` với RTX 50).

### `GET /health`

```json
{
  "status": "ok",
  "model": "arcface_r50",
  "model_label": "ArcFace w600k_r50 (buffalo_l)",
  "provider": "CPUExecutionProvider",
  "load_ms": 1800,
  "uptime_s": 120,
  "embedding_dim": 512,
  "requests": 0, "no_face": 0, "errors": 0, "avg_ms": null
}
```

Backend Node coi service "sống" khi `status` là `ok` và `model` trùng với
`FACE_MODEL` (`arcface_r50`). Các bộ đếm chỉ là số, không có gì về nội dung ảnh.

### `POST /embed`

- Body `multipart/form-data`, một file ở field `image` (JPEG/PNG/WebP).
- Query `max_faces` 1–20 (mặc định 5): số khuôn mặt tối đa trả về, to nhất
  trước. Backend gọi `max_faces=2` khi quét (để phát hiện "nhiều người trong
  khung") và `max_faces=3` khi đăng ký.
- Query `embedding=false` nếu chỉ cần chỉ số chất lượng.

Trả về:

```json
{
  "faces": [
    {
      "index": 0,
      "bbox": [x1, y1, x2, y2],
      "face_px": 180,
      "det_score": 0.91,
      "brightness": 120,
      "blur": 85,
      "embedding": [ /* 512 số thực, đã chuẩn hóa L2 */ ]
    }
  ],
  "image": { "width": 480, "height": 360 },
  "elapsed_ms": 24
}
```

| Trường | Ý nghĩa |
|---|---|
| `face_px` | cạnh ngắn của khung mặt tính theo ảnh gốc — backend đòi ≥ 80 |
| `brightness` | độ sáng trung bình vùng mặt 0–255 — backend đòi ≥ 40 |
| `blur` | độ nét (phương sai Laplacian), càng cao càng nét — backend đòi ≥ 40 |
| `embedding` | vector đơn vị, nên cosine giữa hai vector bằng tích vô hướng |

`faces` rỗng khi không thấy mặt. Lỗi: `400` khi ảnh không đọc được, `413` khi
quá `FACE_MAX_UPLOAD_BYTES`, `500` khi model xử lý thất bại (service không chết).
Ảnh chỉ sống trong request; log chỉ ghi số (KB, số mặt, cỡ mặt, ms xử lý, ms xếp hàng).

Model chạy trên **một luồng riêng với hàng đợi vào trước ra trước**: khi cả lớp
quét cùng lúc, khung đến trước được xử lý trước, còn vòng sự kiện luôn rảnh để
nhận request mới và trả lời `/health` ngay. Laptop xử lý ~9–10 khung/giây, nên
mỗi người đang quét chờ thêm ~0,1 giây cho mỗi người khác đang quét cùng lúc.
Thử tải trên máy chính: 29 người cùng lúc thì mỗi khung chờ tối đa ~3 giây, 40
người ~4 giây — không ai bị báo "Face ID nghỉ" (backend chờ tối đa 8 giây, tức
dư cho khoảng 70–80 người quét cùng một lúc). `avg_ms` ở `/health` là thời gian
xử lý, không tính lúc xếp hàng.

## Đăng ký hồ sơ

Hồ sơ là **một vector trung bình** cho mỗi bạn (đã chuẩn hóa lại), lưu trong
bảng `face_profiles` của backend — không lưu ảnh. Việc này do script Node làm,
chạy trong `20-10be` khi service đang bật:

```
npm run face:enroll                          # quét bench/photos/<Họ và tên>/, khớp tên với database
npm run face:enroll -- --dry-run             # chỉ in bảng "thư mục -> học sinh", không ghi gì
npm run face:enroll -- --student 5 --images a.jpg b.jpg   # một bạn, ảnh bất kỳ
```

Chế độ mặc định khớp tên thư mục với `full_name` (bỏ hoa/thường, dấu cách thừa;
thư mục `test` bị bỏ qua) và báo `CHƯA KHỚP` cho thư mục không tìm thấy. Ảnh
không có mặt bị bỏ qua kèm cảnh báo; ảnh có nhiều mặt thì lấy mặt giống mặt
trung bình của các ảnh còn lại. Đăng ký lại sẽ thay hồ sơ cũ của bạn đó. Bảng
`face_profiles` không nằm trong snapshot backup/restore, nên đổi máy thì chạy
lại lệnh này.

Sau khi đăng ký, vào admin gạt công tắc **✨ Face ID** — thẻ trên trang chủ chỉ
hiện khi công tắc bật, `/health` trả lời và có ít nhất một hồ sơ.

---

# Giai đoạn 1: chọn model (benchmark)

Phần dưới đây phục vụ bước "đo trước, làm sau" trong [FACE_PLAN.md](../FACE_PLAN.md):
so sánh vài model nhận diện khuôn mặt trên **chính ảnh lớp mình**, rồi mới quyết
định có làm tính năng Face ID hay không. Kết quả đã chốt trong `RESULTS.md`;
giữ lại để đo lại khi có thêm ảnh điện thoại thật hoặc đủ 22 bạn.

## Thả ảnh vào đâu

```
bench/photos/<Tên bạn>/<ảnh>.jpg
```

Mỗi bạn một thư mục, tên thư mục là tên bạn đó. Chi tiết và bảng tên khớp với
database nằm trong `bench/photos/README.txt`.

Thư mục `bench/` đã nằm trong `.gitignore` — ảnh không bao giờ lên GitHub.

## Chạy

Bấm đúp `run-bench.bat`, hoặc:

```
face-service\.venv\Scripts\python.exe face-service\bench.py
```

Tuỳ chọn:

| Cờ | Ý nghĩa |
|---|---|
| `--models arcface_r50,lvface_b` | chỉ chạy vài model |
| `--strategies mean` | chỉ một cách đăng ký |
| `--gpu` | dùng GPU (cần `onnxruntime-gpu>=1.27` cho RTX 50) |
| `--photos <đường dẫn>` | bộ ảnh khác |

Kết quả ghi ra `bench/results/`: `report.md` (bảng so sánh + cặp dễ nhầm +
chất lượng ảnh), `results.csv`, `photos.json`.

## Bốn model đang so

| Khoá | Model | Dung lượng | Nguồn |
|---|---|---|---|
| `arcface_r50` | ArcFace w600k_r50 (buffalo_l) | 174 MB | insightface model zoo |
| `glintr100` | ArcFace glintr100 (antelopev2) | 261 MB | insightface model zoo |
| `lvface_b` | LVFace-B Glint360K | 456 MB | HF `bytedance-research/LVFace` |
| `lvface_l` | LVFace-L Glint360K | 1023 MB | HF `bytedance-research/LVFace` |

Model tải về nằm ở `~/.insightface/models/` và `face-service/models/`, cả hai
đều ngoài Git.

Còn thiếu so với kế hoạch: **AdaFace IR101 WebFace12M**. Model này chạy bằng
PyTorch và bản trên HuggingFace cần `trust_remote_code=True` (tức là chạy mã
tải từ HF). Chưa cài, để hỏi trước rồi thêm sau.

## Cách chấm điểm

Dùng chung **một** bộ phát hiện + căn chỉnh (SCRFD `det_10g` của buffalo_l,
warp affine về 112×112) và **một** bộ tiền xử lý (`OnnxRecognizer`) cho mọi
model, nên khác biệt đo được là thuần chất lượng embedding.

- **Bỏ ra một ảnh**: lần lượt lấy từng ảnh làm ảnh cần nhận diện, các ảnh còn
  lại của người đó làm hồ sơ. Cho ra tỉ lệ đúng top-1 và margin top1−top2.
- **Người lạ**: bỏ hẳn một người khỏi thư viện rồi cho ảnh của họ đi nhận diện.
  Điểm cao nhất họ đạt được chính là mức mà người ngoài lớp có thể lọt.
- **Ngưỡng τ** đặt ngay trên điểm người lạ cao nhất, rồi đo còn nhận đúng được
  bao nhiêu phần trăm. Đây là con số quyết định, cổng là **≥ 90%**.

## Điều mà bộ ảnh hiện tại chưa đo được

Nếu mọi ảnh đều cùng loại (đều ảnh kỷ yếu/ảnh đẹp), kết quả sẽ **lạc quan hơn
thực tế**, vì lúc dùng thật hồ sơ là ảnh đẹp còn ảnh quét là camera điện thoại
buổi tối. Muốn có con số thật, cần thêm:

- **Ảnh điện thoại** của vài bạn, chụp buổi tối trong phòng — ít nhất 3–5 tấm/bạn.
- **Ảnh người ngoài lớp** để làm tập mạo danh, càng nhiều càng chắc ngưỡng.

Không có hai thứ đó thì bảng so sánh vẫn dùng được để **xếp hạng model**, chỉ
đừng dùng con số tuyệt đối để bấm nút quyết định.
