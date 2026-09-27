# QD-019 — Chuẩn bị hạ tầng & bộ cài cho 50 quán

**Ngày:** 26/09/2026 · **Trạng thái:** ĐỀ XUẤT — chủ dự án yêu cầu lập P11 (26/09/2026); chờ duyệt.
**Kế hoạch:** `30-KeHoach/P11/` · **Yêu cầu:** OPS-09 (hoàn tất), OPS-10, OPS-11, TENANT-07, PRINT-10..13
**Số đo nền:** `40-KiemTra/PERF-04-DoRealtimeQtFood.md`

## Bối cảnh

Mục tiêu thương mại hóa: lên **50 quán**. Hiện 1 quán bán thật (qt-food, ~115 đơn/ngày). Đo thật cho
thấy tải DB và realtime **không** phải thứ chặn đường (PERF-04). Thứ chặn đường là vận hành: không có
sao lưu tự động, không ai được báo khi hệ thống lỗi, một quán bị spam kéo chậm cả hệ thống, chế độ in
là công tắc chung cho mọi quán, và bộ cài cầu in phải đóng gói riêng từng quán kèm mật khẩu.

## Chủ dự án đã chốt (26/09/2026)

| # | Nội dung | Chốt |
|---|---|---|
| C1 | Supabase Pro | Lên khi mở rộng — **không** nằm trong P11 |
| C2 | Tên miền riêng | Dùng tên miền Vercel hiện tại, chưa cần |
| C3 | Máy Sunmi (QD-018) | Để sau |
| C4 | Hóa đơn điện tử | Để sau |
| C5 | Viết lại `router.refresh()` | Để cổng 50 quán, chỉ làm khi đo quán lớn đòi hỏi |

## Quyết định (đề xuất)

| # | Việc | Chọn | Vì sao | Loại |
|---|---|---|---|---|
| D1 | Sao lưu | **GitHub Actions chạy đêm** `db:backup:day-du` → khóa bằng `age` (khóa công khai) → artifact giữ 90 ngày. Thay phương án "hoãn" của QD-015 | Chạy khi không ai bật máy; sống sót khi mất cả tài khoản Supabase; CI chỉ có khóa công khai nên lộ CI không lộ PII. Lên Pro sau vẫn giữ làm bản ngoài Supabase | Nhiều bản trên Supabase Pro (C) — cùng nhà cung cấp |
| D2 | Theo dõi lỗi | **Sentry** gói miễn phí | Chuẩn cho Next.js; không phải tự dựng | Chỉ log Vercel — Hobby giữ log rất ngắn, không báo ai |
| D3 | Theo dõi sống/chết | **UptimeRobot** (miễn phí, 5 phút/lần) gọi `/api/health` | Dịch vụ ngoài: Vercel chết thì vẫn báo được | Vercel cron — Hobby chỉ chạy 1 lần/ngày |
| D4 | Giới hạn tần suất | **Đếm trong Postgres** (bảng + RPC), khóa theo **token bàn** cho QR, theo **IP** cho đường không có token | Không thêm dịch vụ; +1 lượt DB ~5ms cùng vùng. Cả quán dùng chung một wifi ⇒ khóa theo IP dễ chặn nhầm khách thật, token bàn chính xác hơn | Redis/Upstash — thêm dịch vụ; Vercel Firewall — phụ thuộc gói |
| D5 | Chế độ in | **Cấu hình theo từng quán** trong `tenants.settings.print_mode`. Chuyển tiếp: quán **đang có tài khoản `printer`** → `bridge`, còn lại → `browser` | Bỏ công tắc build-time dùng chung; không quán đang chạy nào đổi hành vi | Giữ env — không trộn được hai kiểu quán |
| D6 | Cấp quyền cầu in | **Mã kích hoạt dùng một lần** (hết hạn 30 phút, lưu dạng băm). Một bộ cài giống nhau cho mọi quán | Bỏ mật khẩu nằm trong file zip đi qua Zalo/USB | Giữ `print-pack.ps1` từng quán |
| D6b | Ai tạo mã kích hoạt (cập nhật 27/09/2026) | **Chủ quán tải bộ cài ở Admin → Máy in → bộ cài kèm sẵn mã** (server chèn `bo-cai\ma-kich-hoat.txt` vào zip lúc tải), cài không phải gõ (chỉ owner, 5 lượt/10 phút/quán); không đọc được mã → bộ cài hỏi như cũ. Super-admin vẫn tạo mã hộ được (PRINT-17) | Chủ dự án: lắp quán mới không phải chờ quản trị hệ thống. Chủ quán vốn toàn quyền dữ liệu quán mình | Chỉ super-admin (bản đầu) — đổi vì chậm; quản lý cũng tạo được — bấm nhầm làm cầu in đang chạy ngừng in giữa ca |
| D7 | Node trên máy quán | **Kèm Node portable** trong bộ cài, không cài vào hệ thống | Bỏ phụ thuộc winget/máy Win10 cũ; cầu in chỉ dùng thư viện có sẵn của Node | Đóng `.exe` (Node SEA) — khó tự cập nhật; ký mã tốn phí năm |
| D8 | Tự cập nhật cầu in | Cầu in tải `print-bridge.mjs` mới từ **chính tên miền app** qua HTTPS, kiểm SHA-256 do server công bố, rồi thoát để `print-bridge.bat` tự chạy lại | Sửa cầu in không phải tới 50 quán | Tới tận quán mỗi lần sửa |

**Mô hình tin cậy của D8 (chấp nhận có ý thức):** ai deploy được lên Vercel thì đẩy được code chạy trên
máy quán. Đây là cùng mức tin cậy với chính web app (nó đã điều khiển mọi thứ quán in ra). Cầu in vẫn chỉ
cầm tài khoản `printer` — không có service-role.

## Hệ quả

- `NEXT_PUBLIC_PRINT_MODE` bị gỡ khỏi code sau D5.
- `print-pack.ps1` và thư mục `cau-in-<slug>` không còn cần thiết sau D6 — xóa cùng lúc bộ cài mới chạy thật ở qt-food.
- QD-015 chuyển trạng thái: **đã thay bằng QD-019 D1**.

## Chủ dự án phải làm (máy không làm thay được)

1. Tạo khóa `age`, **giữ khóa bí mật ở hai nơi** (máy tính + USB hoặc trình quản lý mật khẩu). Mất khóa = mất mọi bản sao lưu.
2. Thêm GitHub secrets cho sao lưu (chuỗi kết nối production, khóa công khai `age`).
3. Tạo tài khoản Sentry + UptimeRobot, đưa DSN vào Vercel env, chọn nơi nhận cảnh báo (email/Telegram).
4. Cài lại cầu in tại qt-food bằng bộ cài mới (sau 11-05).

## Chưa quyết — không chặn P11

- Giờ hỗ trợ cam kết (giờ hành chính hay giờ mở cửa của quán) → cần cho hợp đồng/SLA.
- Người trực thứ hai trước khi vượt ~20 quán.
