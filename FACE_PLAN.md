# KẾ HOẠCH: NHẬN DIỆN KHUÔN MẶT ("MẮT THẦN 20/10") CHO WEB

Tính năng: bạn nữ đứng trước camera → web nhận ra và chào đúng tên → xác nhận → mở trang quà cá nhân. Nhận diện là **lối vào phụ** bên cạnh gõ tên, không phải xác thực.

**Vị trí trong UX (chốt theo yêu cầu):** flow "đăng nhập" hiện tại giữ NGUYÊN 100% (chọn vai trò → gõ tên → mở quà). Face ID là **một mục nhỏ đứng bên cạnh** ô gõ tên, có dòng chú thích duyên dáng kiểu:

> ✨ **Face ID** — *"Nếu cậu đang ở nơi có ánh sáng ổn định, hãy đến với tôi."*

Quy mô: ~30 bạn nữ. Máy chạy: Ryzen 7 7700 / RTX 5060 Ti 16GB / Windows 11 + WSL2 + Docker.

---

## Nguyên tắc bất di bất dịch (chốt từ phân tích)

1. **Không thay thế gõ tên** — Face ID là mục nhỏ bên cạnh; hỏng camera/service thì trải nghiệm gốc nguyên vẹn, nút tự ẩn.
2. **Luôn xác nhận trước khi mở**: "Có phải bạn là **X**? 🌸" — chặn cả nhận nhầm lẫn giơ-ảnh-người-khác.
3. **Dưới ngưỡng thì từ chối duyên dáng**, không bao giờ đoán bừa.
4. **Dữ liệu sinh trắc không rời máy chủ của mình**: không cloud API; bảng embedding **nằm ngoài** danh sách backup/snapshot Git (`backup.js` → `TABLES`); ảnh gốc xóa sau khi trích embedding; ảnh chụp từ camera chỉ sống trong request.
5. **Có sự đồng ý** của các bạn nữ về việc dùng ảnh (không cần tiết lộ chi tiết tính năng để giữ bất ngờ).
6. **Tôn trọng chế độ khóa 20/10**: nhận diện xong mà đang khóa thì vẫn chỉ thấy màn "Chưa đến ngày".
7. Camera chỉ chạy trên HTTPS → dùng link tunnel, không dùng link LAN `http://192.168...`.
8. **Không log ảnh, chỉ log số** (điểm top-1, quyết định, thời gian xử lý); khung hình không bao giờ chạm đĩa, kể cả file tạm.

---

## GIAI ĐOẠN 0 — Chuẩn bị môi trường (nửa buổi)

- [ ] Python 3.12 (venv riêng, ví dụ `face-service/.venv`)
- [ ] `pip install insightface "numpy<2" opencv-python onnxruntime` (CPU trước — chạy được ngay, không phụ thuộc CUDA)
- [ ] GPU (làm sau, không chặn tiến độ): `onnxruntime-gpu>=1.27` (BẮT BUỘC ≥1.27 cho RTX 50-series; bản 1.21–1.26 thiếu kernel sm_120, lỗi hoặc âm thầm rơi về CPU) + cuDNN 9. CUDA 13.1 sẵn có đã khớp.
- [ ] Windows cần VS Build Tools để cài `insightface`; nếu vướng → làm trong WSL2.
- [ ] Riêng model #3 (CVLFace, PyTorch): `pip install torch --index-url https://download.pytorch.org/whl/cu128` (bản pip mặc định KHÔNG chạy RTX 50) — chỉ cài khi đến lượt nó.
- [ ] Thu thập dữ liệu benchmark (xem Giai đoạn 1). Xin phép các bạn có ảnh trong bộ thử.

---

## GIAI ĐOẠN 1 — BENCHMARK 4 MODEL ĐỐI ĐẦU (1–2 ngày) ← trọng tâm

### 1.1. Bốn ứng viên

| # | Model | Định dạng | Dung lượng | Nguồn | Lý do góp mặt |
|---|---|---|---|---|---|
| 1 | **ArcFace w600k_r50** (`buffalo_l`) | ONNX | 174 MB | insightface model zoo | Baseline — pipeline chín nhất, tích hợp dễ nhất |
| 2 | **glintr100** (`antelopev2`) | ONNX | 407 MB | insightface model zoo | Cùng pipeline, backbone R100 — đo xem "to hơn" có đáng không |
| 3 | **AdaFace IR101 WebFace12M** | PyTorch/safetensors | ~260 MB | HF `minchul/cvlface_adaface_ir101_webface12m` | SOTA riêng cho ảnh probe chất lượng thấp (camera điện thoại) — đúng điểm yếu của bài toán |
| 4 | **LVFace-B** | ONNX (chính chủ) | ~theo bản tải | HF `bytedance-research/LVFace` | SOTA 2025 (ICCV), có sẵn script inference ONNX |

Tùy chọn #5 nếu còn thời gian: CVLFace AdaFace **ViT KP-RPE** (mạnh nhất bộ CVLFace nhưng cần aligner DFA riêng — chỉ thử nếu 4 model trên đều dưới kỳ vọng).

### 1.2. Thiết kế công bằng: cô lập biến số

- **Chung một bộ phát hiện + căn chỉnh cho cả 4 model**: SCRFD-10G (`det_10g.onnx` trong buffalo_l) → 5 điểm mốc → warp affine chuẩn ArcFace về 112×112. Nhờ vậy khác biệt đo được là *thuần embedding*, không lẫn tạp chất alignment.
- Cùng một bộ ảnh, cùng cách chuẩn hóa (L2), cùng công thức điểm (cosine).
- Đăng ký thử **cả hai chiến lược**: (a) trung bình embedding của 1–3 ảnh tham chiếu; (b) lấy điểm max theo từng ảnh — báo cáo cả hai.

### 1.3. Bộ dữ liệu thử

| Tập | Nội dung | Số lượng đề xuất |
|---|---|---|
| **Enrollment** (tham chiếu) | Ảnh kỷ yếu 1–3 tấm/người | 5–8 bạn nữ (mở rộng 30 sau khi chốt model) |
| **Probe thật** (genuine) | Ảnh camera điện thoại/webcam của đúng các bạn đó, mô phỏng điều kiện dùng THẬT từ xa: đèn phòng trọ/ký túc xá, buổi tối, đủ sáng/thiếu sáng, chính diện/nghiêng nhẹ, có/không kính | ≥5 tấm/người |
| **Mạo danh** (impostor) | Ảnh camera của người KHÔNG trong tập enrollment: các bạn nữ khác, bạn nam, người lớn | ≥20 tấm |
| **Giả mạo** (spoof) | Chụp lại ảnh kỷ yếu hiển thị trên màn hình điện thoại/bản in | ≥10 tấm |

Lưu cấu trúc thư mục: `bench/enroll/<tên>/*.jpg`, `bench/probe/<tên>/*.jpg`, `bench/impostor/*.jpg`, `bench/spoof/<tên-bị-giả>/*.jpg`. **Thư mục `bench/` cho vào `.gitignore`.**

### 1.4. Chỉ số đo (script tự sinh bảng so sánh)

Cho từng model:

1. **Rank-1 accuracy**: % probe thật được xếp đúng người ở vị trí 1.
2. **Phân bố điểm genuine vs impostor** (vẽ 2 histogram) → chọn **ngưỡng τ** tại điểm impostor-set có 0 false-accept, ghi lại genuine-accept-rate tại τ đó. Đây là con số quyết định: *"nhận đúng bao nhiêu % khi tuyệt đối không nhận nhầm"*.
3. **Margin top1−top2** trên probe thật (trung vị + min) — đo độ "tách bạch" giữa các bạn giống nhau.
4. **Tỉ lệ spoof lọt** tại τ (ảnh giơ lên có vượt ngưỡng không) — để quyết mức cần thiết của bước xác nhận/anti-spoof.
5. **Hiệu năng**: latency/ảnh trên CPU và GPU (trung bình 50 lần), RAM/VRAM chiếm dụng, thời gian load model.
6. Ghi chú định tính: bạn nào bị nhầm với bạn nào (danh sách cặp dễ lẫn).

Đầu ra: `bench/results.csv` + `bench/report.md` (bảng 4 model × các chỉ số trên).

### 1.5. Tiêu chí chốt model

- **Chọn model có genuine-accept-rate cao nhất tại 0 false-accept trên impostor set**; hòa nhau (±2%) thì ưu tiên theo thứ tự: pipeline đơn giản hơn (ONNX/insightface > PyTorch) → latency thấp hơn → dung lượng nhỏ hơn.
- **Ngưỡng đạt yêu cầu để đi tiếp**: ≥90% probe thật nhận đúng tại 0 false-accept. Dưới mức đó → thử biện pháp cứu (thêm ảnh selfie thường vào enrollment, thử model #5) → vẫn dưới thì **dừng tính năng, không tiếc**.
- Chốt luôn: giá trị τ và margin tối thiểu (khởi điểm τ≈0.35–0.4, margin ≥0.05 — thay bằng số đo thật).

---

## GIAI ĐOẠN 2 — Service hóa (1–1.5 ngày)

- `face-service/` (FastAPI, chạy nội bộ port 5002, chỉ bind 127.0.0.1):
  - `POST /embed` — ảnh → detect (chọn mặt to nhất) → align → embedding 512-d. Trả thêm cờ chất lượng (mặt quá nhỏ/mờ → từ chối sớm).
  - `POST /match` — ảnh → embedding → so cosine với danh sách vector nạp từ MySQL → trả `{top: [{student_id, score}], decision}` theo công thức τ + margin.
  - Load model một lần lúc khởi động; health endpoint cho script `.bat`.
- DB: bảng mới `face_profiles (student_id FK, embedding BLOB/JSON, source_count, created_at)` — **migration 017**, và **KHÔNG thêm vào `TABLES` của backup.js/restore.js** (sinh trắc không lên Git).
- Đăng ký embedding: script CLI cho admin (`npm run face:enroll -- --student 5 --images a.jpg b.jpg`) hoặc thêm vào trang admin sau; ảnh nguồn không lưu lại.
- Cập nhật `start-dev.bat` / `start-public.bat` / `setup-local.bat`: mở thêm tiến trình face-service + health-check; nếu service chết, web vẫn chạy bình thường (tính năng tự ẩn).

## GIAI ĐOẠN 3 — Tích hợp web (1.5–2 ngày)

### 3.1. Backend
- Node: `POST /api/face/match` — proxy sang face-service; rate-limit riêng theo chế độ quét liên tục (~350 request/15 phút/IP, xem 3.2); `GET /api/face/status` cho FE biết tính năng có đang sống không. **Không** gắn giftLockGuard vào match, nhưng kết quả mở trang vẫn qua luồng gift hiện có (đã khóa sẵn khi bật khóa).
- Repository pattern: thêm `matchFace`/`faceStatus` vào httpGiftRepository + mock trả "tắt tính năng" để chế độ mock không vỡ.

### 3.2. UX — mục Face ID nhỏ cạnh ô gõ tên (flow gốc không đổi một pixel logic)
- Trong bước "🧑‍🎓 thành viên trong lớp": dưới/cạnh form gõ tên hiện một **thẻ nhỏ** "✨ Face ID" kèm caption *"Nếu cậu đang ở nơi có ánh sáng ổn định, hãy đến với tôi."* Bấm vào mở panel camera (modal, tái dùng `useDialogA11y`).
- **Nút chỉ hiện khi đủ điều kiện** (progressive disclosure): trang chạy HTTPS + trình duyệt có `getUserMedia` + `GET /api/face/status` trả OK. Thiếu một điều kiện → mục Face ID biến mất hoàn toàn, không bao giờ có nút bấm-vào-là-lỗi.
- **Chế độ QUÉT LIÊN TỤC (không chụp ảnh)** — chốt theo yêu cầu:
  - Camera mở và tự quét cho tới khi nhận diện được, **tối đa 2 phút** thì dừng với lời nhắn duyên dáng + gợi ý gõ tên.
  - Vòng lặp phía client: mỗi ~800ms lấy 1 khung hình từ video stream (downscale ~480px, JPEG ~50-150KB), qua gate chất lượng cục bộ (đo sáng + có-mặt-trong-khung) rồi mới gửi lên `/api/face/match`. Khung không đạt gate thì KHÔNG gửi — nhắc tại chỗ ("hơi tối rồi 🌙", "đưa mặt vào khung nhé").
  - **Bỏ phiếu K khung liên tiếp**: chỉ kết luận danh tính khi 2-3 khung liên tiếp cùng trả về một người vượt ngưỡng τ + margin. Chính xác hơn hẳn chụp một tấm — khung nhòe/chớp mắt tự bị đào thải.
  - Nhận diện xong vẫn qua **màn xác nhận** "Có phải cậu là **X**? 🌸" → xác nhận mới chạy `openGiftWithReveal`.
  - Kỹ thuật gửi: bắt đầu bằng HTTP tuần tự từng khung (đơn giản, đủ tốt ở ~1.25fps); chỉ nâng cấp WebSocket nếu đo thấy cần.
  - Rate-limit tính lại cho quét liên tục: ~1.25fps × 120s ≈ 150 khung/phiên → limit **~350 request/15 phút/IP** cho `/api/face/match` (đủ ~2 phiên quét), client tự throttle; server thêm chặn khung > 1MB.
  - UI hiển thị vòng scan + đồng hồ đếm lùi mờ; dừng quét ngay khi tab ẩn (`visibilitychange`) và khi đóng panel (tắt track camera triệt để).
- Dòng minh bạch cập nhật theo chế độ quét: *"Video không được ghi lại — từng khung hình chỉ dùng để so khớp ngay lúc đó rồi bỏ."*
- Mọi đường lỗi rơi êm về gõ tên: từ chối quyền camera / hết 2 phút không nhận ra / service tắt giữa chừng.

---

## NHỮNG NÉT ĐẶC BIỆT (làm tính năng có cá tính — chọn lọc, rẻ mà khác biệt)

1. **Đo sáng ngay trên máy người dùng trong lúc quét** *(chính là gate chất lượng ở mục 3.2 — ăn khớp trực tiếp với caption ánh sáng)*: canvas tính độ sáng trung bình từng khung; tối quá thì nhắc tại chỗ *"Chỗ này hơi tối, tìm chỗ sáng hơn giúp mình nhé 🌙"* và khung đó KHÔNG được gửi lên server. Giảm hẳn thất bại vô ích, người dùng hiểu vì sao.
2. **Hoạt cảnh quét có kịch tính**: suốt phiên quét, vòng scan chạy quanh khung mặt + dòng chữ *"đang so với 30 gương mặt của lớp mình..."* — phiên quét liên tục tự nó là màn trình diễn, đồng thời che luôn latency thật.
3. **Lời chào phân tầng theo độ tự tin**: điểm cao → *"Nhận ra cậu ngay lập tức luôn, Vy! 😄"*; sát ngưỡng → *"Hmm... có phải Vy không ta? 🤔"*. Máy có "tính cách" thay vì trả kết quả khô khan.
4. **Từ chối duyên dáng, xoay vòng câu**: *"Hôm nay cậu xinh quá mình nhận không ra 😅 — thử gõ tên nhé"* / *"Ánh sáng chưa chiều mình rồi, gõ tên giúp mình nha 🌷"*.
5. **Easter egg cho gương mặt lạ** (bạn nam/người ngoài tò mò bấm thử): *"Gương mặt này không nằm trong bộ nhớ 20/10 của mình... nhưng vẫn chúc cậu một ngày thật vui! 🌷"* + nút dẫn sang luồng khách.
6. **Badge kỷ niệm**: mở quà bằng Face ID thì màn GiftReveal thêm dòng nhỏ *"mở bằng Mắt thần 20/10 ✨"* — chi tiết nhỏ nhưng các bạn sẽ khoe nhau.
7. *(Tùy chọn, làm sau nếu dư thời gian)* **Selfie khoảnh khắc**: sau khi mở quà bằng Face ID, hỏi có muốn lưu tấm hình vừa chụp thành một "lời chúc tự gửi" vào trang mình không (tái dùng hạ tầng ảnh-kèm-lời-chúc sẵn có; mặc định KHÔNG lưu).
8. *(Tùy chọn)* **Đếm trên Dashboard admin**: số lượt Face ID thành công/thất bại — vừa vui vừa biết tính năng có được dùng không.

## GIAI ĐOẠN 4 — Kiểm thử & ngày 20/10 (1 ngày + tổng duyệt từ xa)

- Test BE: match trả đúng decision theo τ/margin (mock service), rate-limit, hành xử khi service tắt (503 → FE fallback).
- Đăng ký đủ 30 bạn, chạy lại nhanh bộ benchmark trên gallery đầy đủ (30 người khó hơn 6 người — cặp giống nhau nhiều hơn).
- **Tổng duyệt từ xa** (thay cho tổng duyệt tại lớp): nhờ 2-3 bạn đã biết bí mật thử trên điện thoại của chính họ, ở chỗ họ đang sống, vào buổi tối — đúng điều kiện mọi người sẽ dùng hôm 20/10. Server (máy chính + tunnel) phải trực cả ngày 20/10.
- Tùy chọn: MiniFASNet ONNX (~1.7MB) chế độ *cảnh-báo-mềm* ("Hmm, hình như là ảnh chụp lại? 🤔") — không chặn cứng.
- Công tắc tắt nhanh: key `face_enabled` trong `app_settings` (chốt theo B1) — admin rút tính năng trong vài giây từ Dashboard, không cần restart; FE tự ẩn mục Face ID qua `GET /api/face/status`.

---

## CẢI TIẾN VÒNG 2 (đề xuất bổ sung sau khi rà lại plan)

### Nhóm A — Tăng độ chính xác thật (đáng làm nhất)

- **A1. Học thêm từ lần dùng thật (progressive enrollment)**: mỗi lần Face ID nhận đúng *và người dùng đã bấm xác nhận* với điểm cao, lưu thêm embedding của chính khung hình đó vào hồ sơ (tối đa 5 vector/người, FIFO). Gallery tự tốt dần lên, thu hẹp đúng cái hố "kỷ yếu → camera thật" — cải tiến ăn tiền nhất cả danh sách, gần như miễn phí.
- **A2. (Điều chỉnh cho bối cảnh dùng từ xa)** Không còn buổi tụ họp để chụp ảnh bổ sung tại chỗ → thay bằng: nhờ 2-3 bạn thân (người đã biết bí mật) beta-test từ xa trên điện thoại của chính họ trước ngày 20/10; và vì thế **A1 (học thêm từ lần dùng thật) trở thành cải tiến quan trọng nhất** — nó chính là cách duy nhất để gallery thích nghi dần với đủ loại ánh sáng phòng trọ/ký túc xá mà không cần gặp mặt.
- **A3. (Đã gộp vào thiết kế chính)** Chế độ quét liên tục + bỏ phiếu K khung liên tiếp ở mục 3.2 thay thế hoàn toàn ý "chụp chùm 3 khung hình" — cùng lợi ích, dạng mạnh hơn.
- **A4. Khung oval "đưa mặt vào đây" + gate chất lượng phía client**: overlay oval trên camera; mặt quá nhỏ/lệch tâm/tối (kết hợp đo sáng ở mục 1 phần nét đặc biệt) thì nhắc chỉnh **trước khi gửi** — chuẩn hóa input là cách rẻ nhất nâng độ chính xác toàn hệ.

### Nhóm B — Vận hành & an toàn (bổ sung vào nguyên tắc)

- **B1. Công tắc Face ID nằm trong `app_settings`** (không phải env): thêm key `face_enabled`, admin bật/tắt ngay trên Dashboard cạnh công tắc khóa 20/10 — tắt trong 5 giây không cần restart, tái dùng nguyên hạ tầng settings sẵn có.
- **B2. Không log ảnh, chỉ log số**: request match chỉ ghi (điểm top-1, quyết định, thời gian xử lý); ảnh không bao giờ chạm đĩa kể cả file tạm. Ghi thành nguyên tắc số 8.
- **B3. Limit riêng cho frame camera**: 1MB/request (khung quét đã downscale chỉ ~50-150KB) — nhỏ hơn hẳn limit 5MB của ảnh lời chúc.
- **B4. `/api/face` KHÔNG thêm vào SHARED_DATA_PREFIXES** của dataRevision — match là thao tác đọc, không được làm admin các máy khác remount.
- **B5. Gitignore ngay từ đầu**: `face-service/models/`, `face-service/.venv/`, `bench/` — 4 model benchmark ~1GB, tuyệt đối không để lọt vào repo.
- **B6. Một dòng minh bạch trong panel camera**: *"Ảnh chỉ dùng để nhận diện ngay lúc này, không lưu lại."* — đúng sự thật thiết kế và tăng niềm tin. (Nếu làm A1 thì sửa thành "chỉ lưu khi bạn xác nhận đúng là mình".)
- **B7. Hiệu ứng scan tôn trọng `prefers-reduced-motion`** — đồng bộ chuẩn a11y đã áp cho phần còn lại của web.

### Nhóm C — ĐÃ BỎ

Ý tưởng "Gương thần" (kiosk đặt tại lớp) đã bỏ vì lớp đã lên đại học, không tụ họp trực tiếp — mọi người dùng web **từ xa** qua link. Hệ quả: tính năng Face ID trên điện thoại cá nhân là hình thái duy nhất cần làm, và các giả định "tại phòng học" trong plan đã được thay bằng điều kiện dùng từ xa (xem A2, Giai đoạn 4).

---

## Tổng công sức & rủi ro

| Giai đoạn | Ước lượng |
|---|---|
| 0. Môi trường | 0.5 buổi |
| 1. Benchmark 4 model | 1–2 ngày (gồm thu thập ảnh) |
| 2. Service | 1–1.5 ngày |
| 3. Tích hợp web + nét đặc biệt 1–6 | 1.5–2 ngày |
| 4. Kiểm thử + tổng duyệt | 1 ngày |
| **Tổng** | **~5.5–7 ngày rải rác** (dư dả trước 20/10; mục tùy chọn 7–8 không tính) |

| Rủi ro | Ứng phó |
|---|---|
| Ảnh kỷ yếu gọt mặt/phóng mắt làm lệch embedding | Đã có gate ở 1.5 — đo trước, đạt mới làm; xin thêm selfie thường |
| Hai bạn giống nhau bị lẫn | Margin top1−top2 + màn xác nhận |
| Giơ ảnh trêu nhau | Màn xác nhận (+ MiniFASNet cảnh báo mềm) |
| CUDA/Blackwell lằng nhằng | Chạy CPU — Ryzen 7700 đủ nhanh (~100ms/ảnh) |
| Service chết đúng ngày 20/10 (mọi người dùng từ xa) | Web tự ẩn tính năng qua /api/face/status, gõ tên vẫn chạy; công tắc face_enabled |
| Sinh trắc lọt lên GitHub | face_profiles ngoài TABLES backup; bench/ trong .gitignore; review diff trước khi push |
