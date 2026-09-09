# face-service — Giai đoạn 1: chọn model

Thư mục này phục vụ bước "đo trước, làm sau" trong [FACE_PLAN.md](../FACE_PLAN.md):
so sánh vài model nhận diện khuôn mặt trên **chính ảnh lớp mình**, rồi mới quyết
định có làm tính năng Face ID hay không.

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
