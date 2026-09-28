# P21 — Ứng dụng Windows cho máy thu ngân "POSMenu Thu ngân" (CHỜ QUYẾT)

> Lập 29/09/2026. **Trạng thái: CHỜ QUYẾT** — chủ dự án hỏi "đổi web app thành ứng dụng Windows như đối thủ thì triển khai
> thế nào", chốt: **tạm ghi các phương án**, chưa làm. Đây là khung phạm vi + phương án, **chưa** có plan chi tiết. Khi xếp
> lịch: chủ dự án chọn phương án (§Câu hỏi cần chốt) → viết QD + yêu cầu DESK-xx trong `20-DanhSachYeuCau` → plan 21-0x.
> Phụ thuộc: P11/P12 (cầu in, bộ cài `CAI-DAT.bat`, tự cập nhật PRINT-12), P17 (bán khi mất mạng — màn xem offline).

## Bài toán

Máy quầy hiện chạy **hai thứ rời nhau**: Chrome (lối tắt POS in thẳng `--kiosk-printing`) và **cầu in** Node chạy nền bằng
tác vụ Windows `CauInBep` (cài bằng `CAI-DAT.bat`, tự cập nhật). Hệ quả đã gặp:

- Cài đặt nhiều bước (bat, PowerShell, xin quyền admin, mã kích hoạt) — khó với chủ quán trung tuổi.
- Tác vụ nền có cạm bẫy riêng của Windows: tự tắt sau 72 giờ (sửa 29/09/2026, máy cài trước đó phải sửa tay), dừng khi
  rút sạc.
- Hai tiến trình cầu in chạy cùng lúc thì in trùng; Chrome có thể bị tắt nhầm, đổi cài đặt in.
- Không có "một biểu tượng POSMenu" như đối thủ — trông kém chuyên nghiệp khi bán hàng.

## Đối thủ làm thế nào (tra 29/09/2026)

| Đối thủ | Ứng dụng máy tính | Điểm chính | Nguồn |
|---|---|---|---|
| **KiotViet** | **KiotViet Thu ngân** — `.exe` cho Windows 7 SP1+, có bản macOS. Tải trong trang quản trị web: Hỗ trợ → Tải KiotViet Thu ngân | "In báo bếp và hoạt động bán hàng bình thường trong mạng LAN nội bộ"; mất Internet nhưng còn LAN thì "việc in bếp và nhận gọi món không hề bị ảnh hưởng". Điện thoại/tablet vẫn dùng web, in qua LAN. "Tối ưu hiệu năng phần cứng", "giảm phụ thuộc vào trình duyệt" | kiotviet.vn/ung-dung-kiotviet-thu-ngan/ |
| **CUKCUK** | Bộ cài Windows "Dành cho Thu ngân/Lễ tân" (Hỗ trợ → Download), chạy với quyền admin | Cấu hình Windows 10/11, RAM 4GB (khuyến nghị 8GB); nâng cấp bản mới làm tay | helpv2.cukcuk.vn/vi/kb/phan_mem_cho_thu_ngan |
| **Sapo FnB** | **Không có bản Windows** — app Thu ngân / Phục vụ / Bếp trên Android, iOS | "Khi mất kết nối internet… vẫn cho phép nhân viên gọi món, xem bàn, chuyển món xuống bếp/bar và thanh toán như bình thường" | sapo.vn/app-sapo-fnb-thu-ngan.html |

**Kết luận:** đối thủ có **ứng dụng riêng cho máy thu ngân**; quản trị + điện thoại nhân viên vẫn là web. Làm theo mô
hình này (giống KiotViet): **không viết lại app**, chỉ thêm ứng dụng cho máy quầy.

## Phương án

### A. Bọc web app bằng Electron + gộp cầu in (ĐỀ XUẤT)

Một ứng dụng "POSMenu Thu ngân" cho Windows:

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
| 21-03 | Bộ cài `.exe`, tự cập nhật, ký số | Cài trên máy Windows sạch ≤ 5 phút không cảnh báo SmartScreen; bản mới tự cập nhật ≤ 1 giờ |
| 21-04 | Chuyển qt-food, gỡ cầu in cũ, cập nhật trang `/huong-dan-cai-dat` + tài liệu bàn giao | qt-food bán 1 tuần bằng app, 0 phiếu mất, 0 phiếu trùng |
| (sau) | Bán khi mất Internet trong LAN | Dự án riêng, QD riêng |

## Câu hỏi cần chốt khi xếp lịch

1. **Lý do chính** muốn có ứng dụng Windows: (a) trông chuyên nghiệp / dễ cài, (b) in ổn định, bỏ Chrome + cầu in rời,
   (c) bán được khi mất Internet? — (a)/(b) ⇒ A hoặc B đợt 21-01…21-04; (c) ⇒ thêm phần mở rộng.
2. **Electron (A) hay Tauri (B)?** Đề xuất A vì dùng lại được cầu in Node.
3. **Ký số:** mua chứng chỉ loại nào, đứng tên ai (cá nhân / công ty)?
4. Có cần bản **macOS** như KiotViet không? (đề xuất: không — quán VN dùng Windows là chính)
5. Tên hiển thị: "POSMenu Thu ngân"? (tên POSMenu mới dùng ở trang `/huong-dan-cai-dat`, chưa chốt thành tên chính thức)
