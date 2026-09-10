# Kết quả chọn model — Giai đoạn 1

Ngày đo: 10/09/2026. Dữ liệu: **105 ảnh của 13 người** trong `bench/photos/`
(9 bạn nữ trong lớp và 4 bạn nam, tất cả đã cắt quanh mặt). Chạy trên CPU.

## Kết luận

**Chọn ArcFace w600k_r50 (bộ `buffalo_l` của insightface), đăng ký kiểu `mean`.**

Không phải vì nó nhận đúng nhiều hơn, mà vì mọi model đều nhận đúng như nhau
nên phải phân định bằng những tiêu chí còn lại, và ở đó nó thắng sạch:

| Tiêu chí | ArcFace w600k_r50 | Đối thủ gần nhất |
|---|---|---|
| Cách biệt điểm thật với điểm người lạ, mức "vừa" | **0.547** | 0.544 (LVFace-B) |
| Cách biệt ở mức "nặng" | **0.351** | 0.340 (LVFace-B) |
| Tốc độ | **20 ms/ảnh** | 42 ms (glintr100) |
| Dung lượng | **174 MB** | 261 MB (glintr100) |
| Phụ thuộc | có sẵn trong insightface | phải tải riêng |

Cách biệt lớn nhất là điều đáng giá nhất: ngưỡng chấp nhận càng có nhiều khoảng
trống hai bên thì càng ít rủi ro khi gặp ảnh lạ ngoài bộ đo. Tốc độ cũng quan
trọng hơn vẻ ngoài, vì thiết kế quét liên tục khoảng 1,25 khung mỗi giây.

## Vòng A — ảnh đẹp nhận ảnh đẹp

Cả bốn model đều **100%** ở cả hai chỉ số, không sai một tấm nào trong 105 ảnh.

Vòng này **không dùng để chọn model được**. Nó chỉ có giá trị bắt lỗi dữ liệu:
lần chạy đầu nó chỉ ra một ảnh của bạn Phương bị lấy nhầm mặt người đứng cạnh,
vì người kia to hơn 4% trong khung.

## Vòng B — ảnh đẹp làm hồ sơ, ảnh xấu đem đi nhận

Ảnh xấu sinh ra từ chính bộ ảnh đó: thu nhỏ khuôn mặt, nhoè chuyển động, hạ
sáng, thêm nhiễu cảm biến, nén JPEG. Sau đó **phát hiện lại từ đầu** trên ảnh
xấu, không dùng toạ độ của ảnh gốc. Hồ sơ luôn loại chính tấm đang đem đi nhận.

Nhận đúng khi không một người lạ nào lọt qua:

| Model | Gốc | Nhẹ | Vừa | Nặng |
|---|---|---|---|---|
| ArcFace w600k_r50 | 100% | 100% | 100% | 96,2% |
| ArcFace glintr100 | 100% | 100% | 100% | 97,1% |
| LVFace-B | 100% | 100% | 100% | 95,2% |
| LVFace-L | 100% | 100% | 100% | **88,6%** |

Xếp đúng người vào vị trí số 1: **100% ở mọi model, mọi mức**. Bắt được mặt:
105/105 ở mọi mức.

Hai điều rút ra. Thứ nhất, chất lượng ảnh kém tới mức nhìn bằng mắt đã thấy tối
và nhiễu vẫn chưa làm khó việc phân biệt 13 người này. Thứ hai, **model to hơn
và mới hơn lại kém hơn**: LVFace-L nặng 1 GB tụt xuống 88,6% ở mức nặng, dưới
cổng 90%, trong khi ArcFace 174 MB vẫn 96,2%.

## Ngưỡng khởi điểm

Ngưỡng đo được của model thắng, tại điểm không người lạ nào lọt qua:

| Mức | Ngưỡng τ |
|---|---|
| Gốc | 0,334 |
| Nhẹ | 0,351 |
| Vừa | 0,403 |
| Nặng | 0,412 |

Khởi điểm đề nghị cho lúc triển khai: **τ = 0,45** kèm điều kiện margin giữa
người nhất và người nhì **≥ 0,10**. Cao hơn mọi giá trị đo được ở trên, đổi một
ít tỉ lệ nhận ra để lấy an toàn. Phải đo lại ở vòng C rồi mới chốt.

## Vì sao chưa được coi đây là câu trả lời cuối

1. **Ảnh xấu là ảnh đẹp bị làm hỏng bằng phần mềm.** Nó mô phỏng đúng phần chất
   lượng ảnh, nhưng ảnh thật còn khác ở tư thế, biểu cảm, kiểu tóc, trang điểm
   và khoảng thời gian đã trôi qua. Đó mới là phần khó thật sự.
2. **Mới có 13 người, lớp thật 22 người.** Càng nhiều người càng dễ có hai bạn
   giống nhau.
3. **Người lạ đang được giả lập** bằng cách giấu bớt một trong 13 người. Tập
   người ngoài thật sẽ đa dạng hơn nhiều.

## Việc còn lại trước khi chốt

- Vòng C với **ảnh điện thoại thật**, chụp buổi tối, của vài bạn đã biết bí mật.
- Thêm **ảnh người ngoài lớp** làm tập mạo danh.
- Đăng ký đủ 22 bạn rồi chạy lại, vì bài toán 22 người khó hơn 13 người.

## Cách chạy lại

```
face-service\.venv\Scripts\python.exe face-service\bench.py         # vòng A
face-service\.venv\Scripts\python.exe face-service\bench_hard.py    # vòng B
face-service\.venv\Scripts\python.exe face-service\make_samples.py  # ảnh mẫu
```

Báo cáo ghi ra `bench/results/`. Thư mục đó nằm ngoài Git cùng với ảnh.
