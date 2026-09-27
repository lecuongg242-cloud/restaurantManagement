# QD-020 — POS và in trên mọi thiết bị (điện thoại, iPad, tablet)

**Ngày:** 26/09/2026 · **Trạng thái:** ĐỀ XUẤT — 3 câu hỏi sản phẩm đã được chủ dự án trả lời (26/09/2026);
các lựa chọn kỹ thuật D4–D6 chờ plan 12-01 đo xong mới CHỐT.
**Kế hoạch:** `30-KeHoach/P12/` · **Yêu cầu:** PRINT-14..16, ORDER-19, ORDER-20 · **Liên quan:** QD-005 D1, QD-018, QD-019 D5–D8

## Bối cảnh

- **Màn POS** chỉ dùng được từ ~1024px (tablet ngang, laptop): cột bàn 320px + cột đơn 416px cố định, còn lại
  cho thực đơn. iPad dọc (768–834px) và tablet Android dọc thì vỡ. Điện thoại chỉ có `/pos/m` — **gọi món**,
  không xem bill, không thu tiền.
- **Cầu in** chỉ in **phiếu bếp**, ra **một** máy in bếp LAN, **bỏ dấu** tiếng Việt (máy in nhiệt phổ thông
  không có bảng mã Việt). **Hóa đơn luôn in qua hộp thoại trình duyệt** ⇒ thiết bị không cài máy in
  (điện thoại, iPad) **không in được hóa đơn**.

## Chủ dự án đã chốt (26/09/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| C1 | Điện thoại/iPad/tablet làm được tới đâu? | **POS đầy đủ** — sơ đồ bàn, gọi món, bill, tách/gộp, giảm giá, thu tiền, in, mang về, hàng chờ online, đặt bàn |
| C2 | Hóa đơn in từ thiết bị di động có dấu không? | **Có dấu**, giống hóa đơn in ở quầy hiện nay |
| C3 | Máy in quầy nối kiểu gì? | **Hỗ trợ cả USB (cắm vào máy tính quầy) và LAN** |

## Quyết định (đề xuất)

| # | Việc | Chọn | Vì sao | Loại |
|---|---|---|---|---|
| D1 | Một hay nhiều màn POS | **Một** `/pos` tự co giãn 3 khổ: ≥1024 (3 cột, **y hệt hiện nay**) · 600–1023 (2 cột + ngăn kéo sơ đồ bàn) · <600 (1 cột + thanh tab dưới) | Một bộ nghiệp vụ, một chỗ sửa lỗi | Màn riêng cho từng khổ — nhân ba chỗ sửa |
| D2 | `/pos/m` | Giữ nguyên trong lúc làm; **chuyển hướng về `/pos`** sau khi POS điện thoại được nghiệm thu | Không bỏ màn đang dùng trước khi màn thay thế chạy thật | Xóa ngay |
| D3 | Đường in từ thiết bị di động | Quán ở chế độ `bridge` (QD-019 D5): **mọi** thiết bị (kể cả máy quầy) gửi hóa đơn qua cầu in. Quán `browser`: chỉ máy có máy in in được; thiết bị di động hiện nút in **bị khóa kèm lý do** | Điện thoại không có máy in; cầu in là đường duy nhất | AirPrint — máy in nhiệt quán không hỗ trợ |
| D4 | Hóa đơn có dấu | **Server dựng hóa đơn thành ảnh PNG** (đúng khổ 576/384 chấm) → cầu in chuyển ảnh thành lệnh in ảnh ESC/POS | Có dấu trên **mọi** máy in nhiệt; PNG dùng lại được cho app Sunmi (SDK in ảnh) sau này; máy quán không cần thêm gì | Chrome trên máy quầy chụp trang hóa đơn — phụ thuộc Chrome + đăng nhập trên máy quán; bảng mã CP1258 — nhiều máy không có |
| D5 | Máy in USB | Cầu in gửi **lệnh thô** qua hàng đợi in của Windows theo **tên máy in** | Máy USB đã cài driver ở quầy (bộ cài hiện hỏi "máy in quầy là số mấy") | Chia sẻ máy in qua mạng — thêm bước cấu hình Windows |
| D6 | Hai máy in | Cầu in quản **hai vai**: `bếp` (phiếu bếp) và `quầy` (hóa đơn, phiếu khách); mỗi vai là LAN (IP:cổng) **hoặc** USB (tên máy in Windows) | Đủ cho quán nhỏ; đúng cái bộ cài đang hỏi | Danh sách máy in tùy ý + định tuyến theo món (bếp/quầy bar) — để sau |

> **Cập nhật 27/09/2026 — D2 làm sớm.** Chủ dự án yêu cầu "triển khai hết P12": `/pos/m` đã chuyển hướng về
> `/pos` và `StaffMobileOrder` đã xóa **trước** khi có người thật dùng điện thoại một ca. Bù lại: luồng cũ của
> `/pos/m` (gọi món tại bàn, vào thẳng quầy) chạy E2E trên `/pos` ở 360px; mọi luồng POS chạy E2E ở 390 và 360.
> Mất đường lui: nếu POS điện thoại có lỗi chặn việc ở quán, lùi bằng `git revert` commit này, không có màn cũ
> để chuyển sang. Giữ bản deploy này tới khi thử xong trên điện thoại thật nếu cần đường lui.

**Phiếu bếp giữ in chữ không dấu** như hiện nay: nhanh, đã chạy thật ở qt-food, bếp đọc được. Đổi sang
ảnh có dấu là việc riêng khi có quán yêu cầu.

## Hệ quả

- P12 **sau** P11 11-04 (chế độ in theo quán), 11-05 (bộ cài chung) và 11-06 (tự cập nhật): đổi cầu in mà
  không có tự cập nhật thì phải tới từng quán.
- Mỗi điện thoại/tablet mở POS đầy đủ là **thêm một thiết bị nghe realtime và tải lại** — khác `/pos/m` hiện
  nay (không nghe realtime). Phải đo lại PERF-04 sau khi quán dùng thật (ngưỡng viết lại realtime ở QD-019 C5).
- Font có dấu phải được đóng kèm để server dựng ảnh (giấy phép OFL).

## Chưa quyết — không chặn P12

- Định tuyến theo món (đồ uống ra máy quầy bar, món ra bếp) — chờ quán yêu cầu.
- KDS trên tablet dọc — ngoài phạm vi câu hỏi; KDS hiện chạy ngang.
