# P9 — CHỐT

> Chốt ngày 24/09/2026. Kế hoạch: `00-TongQuan.md`. Báo cáo từng phần: `09-01..09-03-SUMMARY.md`.
> **P9 chốt khi còn dở dang, theo yêu cầu của chủ dự án.** Những gì chưa xong ghi đủ ở cuối tệp.

## Trạng thái

| Plan | Yêu cầu | Trạng thái | Số đo |
|---|---|---|---|
| 09-01 Local ↔ production | OPS-08 | ☑ | Test chạy dưới `TZ=UTC`: **457/457**. Khói production qt-food: **4/4** kiểm được đều đạt, **9/9** ảnh |
| 09-02 Sao lưu | OPS-09 | ◐ | `kiem` bắt bản sao lưu mất 1 hóa đơn (**6070/6071**) mà `verify` cũ báo "khớp". Lịch tự động **hoãn** (`QD-015`) |
| 09-03 Cầu in | PRINT-06 ☑ · 07 ◐ · 08 ◐ | ◐ | Production: cầu in chết → `printed` (in trình duyệt), sống → `pending`. Còn kiểm tại quán |
| 09-04 Kết luận realtime | PERF-04 | ☐ | Chưa bắt đầu — cần 2 tuần log, sớm nhất **08/10/2026** |
| 09-05 Màn "Máy in" (thêm sau chốt) | PRINT-09 | ◐ | Chuỗi thật trên production: máy in bật → "phản hồi"; tắt → "KHÔNG phản hồi"; cầu in chết → "không biết". Thử máy in gửi **0 byte** |

Toàn bộ: **457 unit · 174 RLS** xanh (cả hai dưới `TZ=UTC`) · E2E production `cau-in` **2/2** ·
`tsc` · `lint` · `build` sạch · schema khớp snapshot. Migration **0043** đã áp production.

## Mục tiêu P9 đạt tới đâu

Mục tiêu: *"không còn lớp lỗi nào chỉ xuất hiện trên production, và mất database không còn là sự cố"*.

- **Vế 1 — đạt phần lớn.** Lỗi múi giờ giờ lộ ra ở máy dev. Lỗi ảnh/hạ tầng cũ lộ ra trong một lần
  chạy khói. Cầu in chết không còn làm mất phiếu âm thầm.
- **Vế 2 — chưa đạt.** Bản sao lưu đã tự chứng minh được là dùng được, nhưng **vẫn phải có người
  chạy tay**. Mất database hôm nay vẫn là sự cố nếu không ai vừa chạy sao lưu.

## Ba điều đáng giữ lại từ P9

**1. Đọc code có sẵn trước khi viết.** Plan 09-03 bản đầu định viết bộ cài Windows tự chạy — dự án
đã có. Đọc nó không chỉ tránh viết trùng mà còn lộ ra **hai lỗ gây in trùng** trong chính bộ cài đó
(tác vụ chạy ngầm không cửa sổ → nhân viên mở thêm cầu in; cài lại không tắt bản cũ).

**2. Test phải có khả năng đỏ — và đỏ vì đúng lý do.** Nhiều lần test xanh vì lý do sai: test quyền
nhịp tim xanh vì *hàm chưa tồn tại*; test mã thoát xanh vì `undefined` cũng khác 0. Tất cả đã siết
lại. Và công cụ cũ `verify` chính là một phép kiểm **không bao giờ đỏ** được với loại hỏng thường gặp
nhất — lỗi đáng giá nhất P9 tìm ra.

**3. Đo trước, chọn ngưỡng sau.** Ngưỡng quá hạn 120 giây đến từ p99 = 67 giây, không phải "5 phút
nghe hợp lý". Và chính việc đo lộ ra điều không ai hỏi: đồng hồ laptop ở quán lệch — nên nhịp tim
dùng giờ database.

## Tôi đã sai ở đâu

| Sai | Sửa |
|---|---|
| Plan định viết bộ cài mới | Đã có sẵn — sửa plan, không viết |
| Plan cảnh báo `session_replication_role` "kẹt lại" sau khôi phục | Không thể: lệnh `set` chỉ sống trong phiên kết nối |
| Đánh ☑ PRINT-07/08 khi chưa kiểm tại quán | Hạ về ◐ |
| Spec E2E có lỗi kiểu dữ liệu | Bắt được ở lượt kiểm cuối (`tsc`), trước khi đẩy lên |

## THIẾU SÓT — những gì còn lại

### Phải làm (người)

| # | Việc | Ai | Vì sao quan trọng |
|---|---|---|---|
| 1 | **Cài `cau-in-qt-food.zip` tại quán** | Chủ dự án | Chưa cài thì phiếu bếp in ra **máy quầy** (đường lui), nhân viên phải mang vào bếp |
| 2 | Tại quán: tắt máy bật lại → cầu in tự chạy | Chủ dự án | Nghiệm thu PRINT-08 |
| 3 | Tại quán: double-click `print-bridge.bat` lần hai → báo "đã chạy nền" | Chủ dự án | Chứng minh khóa một phiên trên máy thật |
| 4 | Tại quán: rút dây máy in, in 3 phiếu → băng đỏ trên POS | Chủ dự án | Nghiệm thu PRINT-07 |
| 5 | Chạy sao lưu tay trước mọi thao tác rủi ro | Ai thao tác | Không có lịch tự động (`QD-015` hoãn) |

### Chưa làm (chờ điều kiện)

| # | Việc | Chờ gì |
|---|---|---|
| 6 | **09-04 / `QD-016`** — có viết lại realtime không | Đủ 2 tuần log, sớm nhất 08/10/2026 |
| 7 | Lịch sao lưu tự động | Chủ dự án chốt `QD-015` (đề xuất: A + C) |
| 8 | Diễn tập khôi phục **bằng công cụ mới** (`kiem`) + đo thời gian tới lúc app chạy lại | Một project trống — gói free chỉ 2 slot. Diễn tập sáng 24/09 (SG1→SG2) dùng công cụ cũ |
| 9 | Xóa project SG1 | Chỉ sau mục 8. Hiện là **đường lui duy nhất** |

### Giới hạn đã biết, chấp nhận có ý thức

| # | Giới hạn | Hậu quả |
|---|---|---|
| 10 | ~~Nhịp tim đo cầu in sống, không đo máy in sống~~ — **đã giải quyết ở 09-05**: cầu in thử máy in mỗi nhịp tim, màn `/admin/printers` hiện "KHÔNG phản hồi". Phiếu gửi tới lúc máy in chết vẫn đi vào hàng đợi rồi `failed` | Chủ quán thấy trước trên màn Máy in thay vì chờ phiếu lỗi |
| 11 | Đường lui in ra **máy in cài trên máy POS** (thường là máy in hóa đơn ở quầy) | Nhân viên phải mang phiếu vào bếp. Máy POS không có máy in thì hiện hộp thoại in |
| 12 | Khe `superseded`: cầu in đang gửi (~1 giây) đúng lúc bấm in lại | Vẫn có thể ra hai tờ |
| 13 | Khóa một phiên chỉ trong **một máy** | Hai laptop cùng chạy cầu in cho một quán → vẫn in trùng |
| 14 | `printed_at` vẫn do **đồng hồ laptop** ghi | Số đo "in mất bao lâu" có lẫn độ lệch đồng hồ. Chỉ nhịp tim đã chuyển sang giờ database |
| 15 | "Đã xử lý" trên băng lỗi lưu theo **từng máy** và so theo `created_at` của phiếu | Phiếu tạo trước lúc bấm nhưng hỏng sau đó bị bỏ qua |
| 16 | Chế độ cầu in là cấu hình **toàn hệ thống** | Quán không dùng cầu in (tenant demo) thấy băng "Chưa có cầu in" thường trực |
| 17 | REPORT-11 lấy mốc "đã in lúc" **không lọc trạng thái** | Lượt `superseded`/`pending` (chưa từng in) cũng được tính — không phải lỗi mới |
| 18 | Khói **không kiểm được giờ hiển thị** — không trang công khai nào hiện giờ | Lớp lỗi múi giờ chặn ở bộ test thay vì trên production |
| 19 | Khói **chạy tay**, không tự chạy sau deploy | Làm được bằng GitHub `deployment_status`, cần thêm cấu hình |
| 20 | Khói phá cache CDN nhưng **không phá `unstable_cache`** | Trang 200 + dữ liệu đúng không chứng minh database đang sống |

### Chưa từng kiểm trên thiết bị thật

| # | Thứ | Đã kiểm tới đâu |
|---|---|---|
| 21 | `print-setup.ps1` (bản đã sửa) chạy trọn trên Windows | Chỉ bộ phân tích cú pháp PowerShell. Logic `errorlevel` của `.bat` có thử trên cmd.exe thật |
| 23 | Thử máy in kiểu "mở kết nối rồi đóng, không gửi byte" trên **máy in nhiệt thật** | Máy in giả nhận 0 byte qua 8 lần thử. Chưa có công tắc tắt việc thử nếu máy in thật hành xử lạ |
| 22 | Chuỗi đầy đủ **cầu in thật → nhịp tim → POS đổi đường → giấy ra ở máy in thật** | Từng khúc riêng: cầu in báo sống thật (tenant demo); đổi đường thật trên production với nhịp tim giả lập. Chưa bao giờ cả chuỗi với máy in phần cứng |

### Ngoài phạm vi P9 nhưng vẫn treo

- **Hơn 40 yêu cầu `◐` chờ nghiệm thu người thật** từ P2–P8 — 7 phiên ở
  `40-KiemTra/00-DanhSachNghiemThu.md`. Khoản nợ lớn nhất của dự án, không phải việc code.
- Rate limit endpoint ẩn danh — chưa đo thì không biết đặt ngưỡng nào.

## Tệp mang ra quán

`cau-in-qt-food.zip` ở gốc repo (gitignored). Chứa **mật khẩu tài khoản cầu in** của qt-food — không
gửi qua Zalo/email. Mất thì vào `/super` cấp lại rồi chạy
`scripts/print-pack.ps1 -Slug qt-food -BridgePassword '<mật khẩu mới>'`.
