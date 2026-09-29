# P21 — Ứng dụng Windows cho máy thu ngân "TechMenu Thu ngân" (CODE XONG 21-01→21-03 — chưa deploy/phát hành)

> Lập 29/09/2026. **Trạng thái: ĐÃ CHỐT PHƯƠNG ÁN A** (chủ dự án, 29/09/2026 — xem **QD-026**): Electron + gộp cầu in,
> **ký số sau khi app hoàn thiện**, tên **TechMenu Thu ngân** (tên miền dự kiến `techmenu.vn`, chưa mua), bán khi mất Internet để sau. Kích hoạt bằng email + mật khẩu chủ quán **hoặc quản lý chi nhánh** (QD-028 — quản lý vào thẳng chi nhánh của mình, chỉ tài khoản nhiều chi nhánh mới chọn), app có Thu ngân + Màn bếp (QD-026 D6, D7).
> Yêu cầu: **DESK-01..12** trong `20-DanhSachYeuCau/00-Requirements.md`. Plan: `21-01-PLAN.md` … `21-04-PLAN.md`. Kết quả + việc còn lại: `21-SUMMARY.md`.
> Phụ thuộc: P11/P12 (cầu in, bộ cài `CAI-DAT.bat`, tự cập nhật PRINT-12), P17 (bán khi mất mạng — màn xem offline).

## Bài toán

Máy quầy hiện chạy **hai thứ rời nhau**: Chrome (lối tắt POS in thẳng `--kiosk-printing`) và **cầu in** Node chạy nền bằng
tác vụ Windows `CauInBep` (cài bằng `CAI-DAT.bat`, tự cập nhật). Hệ quả đã gặp:

- Cài đặt nhiều bước (bat, PowerShell, xin quyền admin, mã kích hoạt) — khó với chủ quán trung tuổi.
- Tác vụ nền có cạm bẫy riêng của Windows: tự tắt sau 72 giờ (sửa 29/09/2026, máy cài trước đó phải sửa tay), dừng khi
  rút sạc.
- Hai tiến trình cầu in chạy cùng lúc thì in trùng; Chrome có thể bị tắt nhầm, đổi cài đặt in.
- Không có "một biểu tượng TechMenu" như đối thủ — trông kém chuyên nghiệp khi bán hàng.

## Đối thủ làm thế nào (tra 29/09/2026)

| Đối thủ | Ứng dụng máy tính | Điểm chính | Nguồn |
|---|---|---|---|
| **KiotViet** | **KiotViet Thu ngân** — `.exe` cho Windows 7 SP1+, có bản macOS. Tải trong trang quản trị web: Hỗ trợ → Tải KiotViet Thu ngân | "In báo bếp và hoạt động bán hàng bình thường trong mạng LAN nội bộ"; mất Internet nhưng còn LAN thì "việc in bếp và nhận gọi món không hề bị ảnh hưởng". Điện thoại/tablet vẫn dùng web, in qua LAN. "Tối ưu hiệu năng phần cứng", "giảm phụ thuộc vào trình duyệt" | kiotviet.vn/ung-dung-kiotviet-thu-ngan/ |
| **CUKCUK** | Bộ cài Windows "Dành cho Thu ngân/Lễ tân" (Hỗ trợ → Download), chạy với quyền admin | Cấu hình Windows 10/11, RAM 4GB (khuyến nghị 8GB); nâng cấp bản mới làm tay | helpv2.cukcuk.vn/vi/kb/phan_mem_cho_thu_ngan |
| **Sapo FnB** | **Không có bản Windows** — app Thu ngân / Phục vụ / Bếp trên Android, iOS | "Khi mất kết nối internet… vẫn cho phép nhân viên gọi món, xem bàn, chuyển món xuống bếp/bar và thanh toán như bình thường" | sapo.vn/app-sapo-fnb-thu-ngan.html |

**Chi tiết luồng KiotViet Thu ngân** (tra 29/09/2026, kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-che-bien/ung-dung-kiotviet-thu-ngan-may-tinh/):
- Tải: trang quản trị → biểu tượng (?) góc phải → **Tải KiotViet Thu ngân** → chạy `KiotViet_Thungan.exe` → cài xong app tự mở.
- Màn đăng nhập: **Tên gian hàng**, **Tên đăng nhập**, **Mật khẩu**.
- Sau đăng nhập: màn **Thu ngân** / **Bếp** / **Lễ tân**; menu ☰ có **Đồng bộ dữ liệu** và đổi chi nhánh.
- Máy in: khuyến nghị đặt IP tĩnh cho máy in; mọi thiết bị chung một router (LAN).
- Cấu hình tối thiểu Windows 7 SP1, Pentium 4, RAM 1GB, ổ 4GB; khuyến nghị Core i3, RAM 2GB.

**Kết luận:** đối thủ có **ứng dụng riêng cho máy thu ngân**; quản trị + điện thoại nhân viên vẫn là web. Làm theo mô
hình này (giống KiotViet): **không viết lại app**, chỉ thêm ứng dụng cho máy quầy.

## Phương án

### A. Bọc web app bằng Electron + gộp cầu in (ĐỀ XUẤT)

Một ứng dụng "TechMenu Thu ngân" cho Windows:

1. Cửa sổ mở **chính trang POS hiện tại** (`/r/{slug}/pos`) — không viết lại giao diện; tính năng mới trên web có ngay.
2. **Cầu in nằm trong app**: dùng lại gần như nguyên `scripts/print-bridge.mjs` (Node) — in phiếu bếp + hóa đơn thẳng ra
   máy in USB/LAN, không hộp thoại. Thay tác vụ `CauInBep` + lối tắt Chrome.
3. Tự khởi động cùng Windows, biểu tượng ở khay hệ thống, **tự cập nhật** (thay cơ chế PRINT-12 hiện có).
4. Bộ cài `.exe` bấm Next; tải ở Admin → Máy in như bộ cài hiện nay. Đăng nhập thiết bị (mã kích hoạt) làm trong app.

| Được | Mất / rủi ro |
|---|---|
| Dùng lại code cầu in Node; nền tảng quen thuộc (VS Code, Slack, Zalo PC) | Bộ cài lớn (~100 MB) |
| Một tiến trình duy nhất ⇒ hết in trùng do chạy hai cầu in, hết lỗi tác vụ nền 72 giờ | Phải tự lo cập nhật Chromium đi kèm (bảo mật) |
| In thẳng không cần Chrome `--kiosk-printing` | Cần ký số (xem §Chi phí) |

### B. Bọc bằng Tauri (WebView2 của Windows)

Như A nhưng vỏ dùng WebView2 có sẵn trong Windows 10/11.

| Được | Mất / rủi ro |
|---|---|
| Bộ cài nhỏ (~10 MB), nhẹ máy cũ | Phần in phải **viết lại** bằng Rust (hoặc chạy Node kèm theo ⇒ mất lợi thế nhẹ) |
| Chromium do Windows cập nhật | Máy Windows 10 cũ có thể thiếu/hỏng WebView2 ⇒ bộ cài phải kèm |

### C. Giữ web + cài như PWA (không làm app riêng)

Cài POS lên màn hình chính bằng Chrome (P17 17-01 đã có manifest), cầu in vẫn chạy nền như nay.

| Được | Mất / rủi ro |
|---|---|
| Gần như 0 công | Vẫn hai thứ rời, vẫn cạm bẫy tác vụ nền; không giống đối thủ |

### Phần mở rộng (tùy chọn, dự án riêng): bán khi mất Internet trong mạng nội bộ

Như KiotViet / Sapo: mất Internet vẫn gọi món, gửi bếp, thanh toán. Cần **dữ liệu lưu tại máy quầy** + máy quầy làm máy
chủ nội bộ cho điện thoại trong quán + **đồng bộ lại** khi có mạng (xử lý xung đột: số hóa đơn, tồn kho, hai máy cùng sửa
một bàn). Đây là thay đổi kiến trúc lớn, **không** đi kèm A/B. P17 đã chốt "mất mạng: máy quầy chỉ xem, dùng 4G trên
điện thoại" (QD-024) — làm phần này nghĩa là mở lại QD-024.

## Chi phí và rủi ro chung (A hoặc B)

- **Ký số ứng dụng (code signing):** không ký ⇒ Windows SmartScreen hiện "Windows protected your PC", phần mềm diệt virus có
  thể chặn — với chủ quán trung tuổi gần như hỏng việc cài. Chi phí chứng chỉ theo năm: **kiểm lúc mua** (chưa tra giá).
- Thử trên Windows 10 + 11, máy cũ (RAM 4GB), máy có diệt virus, máy in USB (driver Windows) + LAN.
- Chuyển quán đang chạy (qt-food) từ cầu in + Chrome sang app: gỡ tác vụ `CauInBep`, không để hai thứ cùng in.
- Bảo trì thêm một sản phẩm: phát hành, cập nhật, hỗ trợ lỗi cài đặt.

## Các đợt dự kiến (nếu chọn A)

| Đợt | Nội dung | Xong khi (đo được) |
|---|---|---|
| 21-01 | Vỏ app mở POS, nhớ đăng nhập, tự khởi động cùng Windows, khay hệ thống | Bật máy → POS tự mở đúng quán, không phải đăng nhập lại; tắt cửa sổ → app vẫn chạy ở khay |
| 21-02 | Gộp cầu in vào app, in thẳng hóa đơn + phiếu bếp | Test giả lập mất mạng của P17 (`cau-in-mat-mang`) xanh với app; in không hộp thoại; không in trùng |
| 21-03 | Bộ cài `.exe`, tự cập nhật (chưa ký số — ký sau khi hoàn thiện, QD-026 D3) | Cài trên máy Windows sạch ≤ 5 phút theo hướng dẫn (có bước qua SmartScreen "More info → Run anyway"); bản mới tự cập nhật ≤ 1 giờ không hiện cảnh báo |
| 21-04 | Chuyển qt-food, gỡ cầu in cũ, cập nhật trang `/huong-dan-cai-dat` + tài liệu bàn giao | qt-food bán 1 tuần bằng app, 0 phiếu mất, 0 phiếu trùng |
| (sau) | Bán khi mất Internet trong LAN | Dự án riêng, QD riêng |

## Đã chốt (chủ dự án, 29/09/2026 — chi tiết QD-026)

1. **Mục tiêu:** thương mại hóa lâu dài ⇒ làm (a) + (b) ngay (đợt 21-01…21-04); (c) bán khi mất Internet trong LAN để sau.
2. **Electron (A)** — dùng lại cầu in Node; phần offline sau này cũng viết bằng Node.
3. **Ký số để sau, khi app hoàn thiện.** Trong lúc chưa ký, lần cài đầu phải qua SmartScreen theo hướng dẫn; bản cập nhật
   tự cài trong app không bị cảnh báo.
4. **Không làm macOS.**
5. Tên: **TechMenu Thu ngân**, tên miền dự kiến `techmenu.vn` (+ giữ `techmenu.com.vn`), chưa mua. Tra sơ bộ chưa trùng ai ở VN; nộp đơn nhãn hiệu tại VN trước khi bán rộng (QD-026 D4).
