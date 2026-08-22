# LỘ TRÌNH TỚI NGÀY 20/10

Cập nhật: 22/08/2026 — còn **59 ngày**.

Code đã sẵn sàng. Nút thắt hiện tại là **nội dung** và **hạ tầng ngày lễ**,
không phải tính năng.

## Thực trạng nội dung (đo từ database ngày 22/08)

| Hạng mục | Hiện tại | Mục tiêu |
|---|---|---|
| Ảnh trong thư viện | 2 | ~3-5 ảnh/bạn ≈ 70-110 |
| Học sinh chưa có ảnh | 21/22 | 0 |
| Học sinh chưa có avatar | 22/22 | 0 |
| Học sinh chưa có lời chúc | 19/22 | 0 |
| Chỗ ngồi | ✅ 22/22 | xong |

---

## GIAI ĐOẠN 1 — NỘI DUNG (bắt đầu ngay, xong trước 15/09)

Đây là việc **tốn thời gian nhất vì phụ thuộc người khác**, nên phải khởi động
sớm nhất. Mọi thứ khác có thể làm song song.

- [ ] Gom ảnh kỷ yếu / ảnh lớp: cần ~3-5 ảnh cho mỗi bạn nữ
- [ ] Chọn 1 avatar cho mỗi bạn (dùng luôn ảnh kỷ yếu đẹp nhất)
- [ ] Upload qua trang admin → Thư viện ảnh (chọn học sinh → kéo thả, tối đa 20 ảnh/lần)
- [ ] Viết lời giới thiệu riêng cho từng bạn (hiện đang dùng câu mẫu giống nhau)
- [ ] Kiểm tra lại: trang Tổng quan phải hiện "Chưa có ảnh: 0"

**Mẹo:** ảnh kỷ yếu dùng được cho cả tính năng Face ID sau này (xem FACE_PLAN.md),
nên gom một lần dùng hai việc.

## GIAI ĐOẠN 2 — VẬN ĐỘNG LỜI CHÚC (15/09 → 15/10)

Đây là lúc tính năng khóa 20/10 phát huy tác dụng: các bạn **gửi được** lời chúc
nhưng các bạn nữ **chưa xem được**.

- [ ] Vào Tổng quan → bấm **🔒 Khóa chờ 20/10**
- [ ] Kiểm chứng: mở một trang quà bất kỳ phải thấy màn "Chưa đến ngày 20/10"
- [ ] Gửi link cho các bạn nam kèm hướng dẫn ngắn (dùng nút "Gửi lời chúc")
- [ ] Duyệt lời chúc dần mỗi vài ngày (Admin → Lời chúc → Duyệt nhanh)
- [ ] Nhắc lại đợt 2 khoảng đầu tháng 10 cho những bạn chưa gửi
- [ ] Theo dõi: bạn nào chưa có lời chúc nào thì nhờ người thân trong lớp viết hộ

## GIAI ĐOẠN 3 — FACE ID (tùy chọn, song song, quyết định trước 30/09)

Chi tiết trong `FACE_PLAN.md`. Nguyên tắc: **đo trước, làm sau**.

- [ ] Giai đoạn 0-1: dựng môi trường + benchmark 4 model với ảnh thật
- [ ] **Cổng quyết định:** đạt ≥90% nhận đúng ở mức 0 nhận nhầm mới làm tiếp
- [ ] Nếu đạt: giai đoạn 2-4 (service, tích hợp, tổng duyệt)
- [ ] Nếu không đạt: **bỏ, không tiếc** — nhận nhầm trước cả lớp tệ hơn không có

## GIAI ĐOẠN 4 — HẠ TẦNG NGÀY LỄ (01/10 → 15/10)

Vấn đề chưa giải quyết: **link `trycloudflare.com` đổi mỗi lần khởi động lại**,
và **máy phải bật suốt ngày 20/10**.

- [ ] Chọn một trong ba cách:
  - **A. Giữ nguyên** — laptop bật cả ngày + quick tunnel. Miễn phí, rủi ro cao
    (mất điện/mạng là sập, link đổi là phải gửi lại)
  - **B. Link cố định** — tên miền miễn phí từ GitHub Student Pack + Cloudflare
    named tunnel. Vẫn cần máy bật, nhưng link không bao giờ đổi
  - **C. Đưa app lên hosting** — vì database đã ở trên cloud, backend giờ có thể
    chạy ở bất cứ đâu. VPS ~50-68k/tháng, hoặc thử gói free của Northflank
    (always-on, region Đông Nam Á). Hết cảnh phụ thuộc laptop
- [ ] Chống Aiven ngủ đông: đặt tác vụ gọi `/api/ready` mỗi ngày
- [ ] Đổi mật khẩu Aiven (mật khẩu hiện tại đã từng đi qua chat)
- [ ] Chạy `npm run backup:shared` + push — lưới an toàn vì gói free không tự backup

## GIAI ĐOẠN 5 — TỔNG DUYỆT (15/10 → 19/10)

- [ ] Nhờ 1-2 bạn đã biết bí mật thử trên điện thoại của họ, buổi tối, mạng 4G
- [ ] Kiểm tra trên iPhone lẫn Android (camera, nhạc, chia sẻ link)
- [ ] Duyệt nốt lời chúc tồn đọng
- [ ] Kiểm tra từng trang quà một lượt: đủ ảnh, đúng người, lời chúc hiển thị đúng
- [ ] `npm run db:check` trên cả hai máy — xác nhận cùng nhìn một database
- [ ] Chuẩn bị sẵn tin nhắn gửi cả lớp sáng 20/10

## NGÀY 20/10

- [ ] Sáng sớm: mở web, kiểm tra `/api/ready` trả `ready`
- [ ] Tổng quan → bấm **🎉 Mở trang quà**
- [ ] Gửi link cho các bạn nữ
- [ ] Trực máy: theo dõi lỗi, duyệt lời chúc phát sinh trong ngày
- [ ] Cuối ngày: `npm run backup:shared` + push để lưu kỷ niệm

---

## Nợ kỹ thuật (chỉ làm khi rảnh — không ảnh hưởng ngày 20/10)

Từ đợt rà soát mã nguồn, các mục mức "nhỏ" còn lại:

- [ ] Gom hằng số rải rác về `config/constants.js`
- [ ] Thống nhất thông điệp lỗi API (hiện lẫn Anh-Việt)
- [ ] Dọn CSS chết trong `landing.css`, gỡ 12 `!important` ở `seatletter.css`
- [ ] Thêm ESLint/Prettier cho backend
- [ ] Bổ sung test cho `exportService` (có lỗ CSV formula injection chưa xử lý)
- [ ] Gỡ bảng `music`/`videos` không dùng khỏi schema
