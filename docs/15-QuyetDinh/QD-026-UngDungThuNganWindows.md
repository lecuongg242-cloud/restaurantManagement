# QD-026 — Ứng dụng Windows cho máy thu ngân "TechMenu Thu ngân": Electron + gộp cầu in, ký số sau

**Ngày:** 29/09/2026 · **Trạng thái:** ĐÃ CHỐT (chủ dự án, 29/09/2026) — chưa xếp lịch triển khai.
**Kế hoạch:** `30-KeHoach/P21/` · **Yêu cầu:** DESK-01..12
**Liên quan:** QD-018/019/020 (thiết bị POS, cầu in, in từ mọi thiết bị), QD-024 (bán khi mất mạng — giữ nguyên)

## Bối cảnh

Chủ dự án muốn **thương mại hóa lâu dài** và có ứng dụng Windows cho máy quầy như đối thủ. Phân tích phương án và đối thủ
(KiotViet Thu ngân, CUKCUK, Sapo FnB) ở `30-KeHoach/P21/00-TongQuan.md`.

## Quyết định

| # | Việc | Chọn | Vì sao | Phương án bị loại |
|---|---|---|---|---|
| D1 | Công nghệ vỏ app | **Electron** mở trang POS hiện có + **gộp cầu in** (`scripts/print-bridge.mjs`) vào app (phương án A) | Dùng lại code cầu in Node; một tiến trình duy nhất ⇒ hết in trùng, hết lỗi tác vụ nền 72 giờ. Lâu dài: nếu sau này làm bán khi mất Internet trong LAN (máy quầy làm máy chủ nội bộ, lưu dữ liệu tại chỗ) thì viết bằng Node, cùng ngôn ngữ với toàn dự án | Tauri (B) — phần in + máy chủ nội bộ phải viết bằng Rust, thêm một ngôn ngữ phải duy trì. PWA (C) — vẫn hai thứ rời, không giống đối thủ |
| D2 | Phạm vi | Đợt 21-01…21-04: vỏ app, gộp cầu in, bộ cài + tự cập nhật, chuyển qt-food. **Bán khi mất Internet trong LAN: để sau**, dự án riêng, sẽ phải mở lại QD-024 | Giải quyết ngay cài đặt khó + in không ổn định; phần offline là thay đổi kiến trúc lớn | Làm offline cùng lúc |
| D3 | Ký số ứng dụng | **Chưa ký số trong lúc làm app; ký số sau khi app hoàn thiện** (chủ dự án, 29/09/2026) | Không tốn phí chứng chỉ trả theo năm khi app chưa bán; thêm ký số về sau không đổi kiến trúc | Mua chứng chỉ ngay từ đầu |
| D4 | Tên hiển thị | Thương hiệu **TechMenu**; app máy quầy: **"TechMenu Thu ngân"**; tên miền dự kiến **`techmenu.vn`** (+ giữ `techmenu.com.vn`) — **chưa mua** (chủ dự án, 29/09/2026) | Theo kiểu "KiotViet Thu ngân"; tra sơ bộ chưa trùng ai ở VN; `.vn` còn trống | "POSMenu" (tên tạm ở `/huong-dan-cai-dat`); "MenuTech" (trùng Menutech Berlin cùng ngành); "McTech" (trùng Cty TNHH Kỹ thuật Mỹ Cường — McTech, phân phối linh kiện máy tính tại VN từ 1998; rủi ro McDonald's phản đối tiền tố "Mc" trong ngành ăn uống); `techmenu.top` (đuôi `.top` bị lạm dụng spam/lừa đảo ⇒ email vào spam, bộ cài chưa ký tải từ đó dễ bị chặn); `techmenu.com` (đã có chủ, rao bán lại ~104.000 USD) |
| D5 | macOS | **Không làm** | Quán VN dùng Windows là chính; Electron làm được bản Mac sau nếu cần | — |
| D6 | Kích hoạt máy quầy | **Email + mật khẩu chủ quán** ngay trong app (chủ dự án, 29/09/2026). Server kiểm owner rồi tự cấp tài khoản `printer` bằng cơ chế mã kích hoạt PRINT-11 (mã chỉ dùng nội bộ); mật khẩu chủ quán không lưu trên máy | Giống KiotViet (đăng nhập tài khoản trong app); không phải vào Admin tạo mã | Gõ mã kích hoạt 8 ký tự như bộ cài cầu in — thêm bước, khác đối thủ |
| D7 | Màn hình trong app | **Thu ngân + Màn bếp** (chủ dự án, 29/09/2026), chuyển bằng menu ☰; nhớ màn chọn lần trước | Giống KiotViet (Thu ngân / Bếp / Lễ tân); Màn bếp chỉ là mở trang KDS sẵn có | Chỉ Thu ngân; thêm Lễ tân (đặt bàn đang ở admin web — để sau) |
| D8 | Quyền khi cài | Cài cho người dùng hiện tại, **không cần quyền admin** (chủ dự án đồng ý 29/09/2026; lệch CUKCUK "chạy với quyền admin") | Bản chưa ký thì hộp xin quyền admin hiện "Nhà phát hành: Không xác định" — bỏ được một cảnh báo; tự khởi động + in USB không cần admin | Cài cho mọi người dùng (cần admin) |

## Hệ quả của D3 (không ký số) — cách xử lý

| Hệ quả | Xử lý |
|---|---|
| Lần cài đầu, Windows SmartScreen hiện **"Windows protected your PC"** (không có nút chạy ngay) | Trang `/huong-dan-cai-dat` + tài liệu bàn giao có bước kèm ảnh: bấm **"More info" → "Run anyway"**. Kỹ thuật viên/đại lý cài hộ quán lần đầu |
| Mỗi bản phát hành mới là một file mới ⇒ tải bằng trình duyệt lại bị cảnh báo (file không ký không tích lũy uy tín qua các bản) | **Tự cập nhật trong app** (app tự tải bản mới, không qua trình duyệt) ⇒ quán đang dùng không gặp lại cảnh báo. Chỉ lần cài mới mới phải qua bước trên |
| Chrome/Edge có thể báo "tệp không thường được tải xuống" | Hướng dẫn có bước "Giữ lại" (Keep) |
| Diệt virus có thể chặn nhầm | Mỗi bản phát hành: nếu bị Microsoft Defender báo nhầm thì gửi báo cáo nhầm cho Microsoft (miễn phí); hướng dẫn thêm cách cho phép app |
| Cửa sổ UAC hiện "Nhà phát hành: Không xác định" | Tránh bằng D8 (cài không cần admin); chỉ còn khi gỡ tác vụ cầu in cũ (DESK-08) — ghi trong hướng dẫn |

**Ký số khi:** app hoàn thiện (xong 21-01…21-04), trước khi bán rộng. Thêm ký số **không** đổi kiến trúc app (chỉ thêm bước
ký vào quy trình build). Các cách xử lý ở bảng trên áp dụng cho giai đoạn chưa ký (thử nghiệm, qt-food).

## Kết quả tra tên TechMenu (29/09/2026) và việc cần làm

- **VN:** chưa thấy phần mềm nhà hàng nào tên TechMenu. Chỉ có TechMag Vietnam dùng "TechMenu" làm tên chuyên mục đánh giá
  sản phẩm trên YouTube (truyền thông, khác ngành).
- **Nước ngoài, cùng ngành:** Invenio Technologies có hệ thống gọi món điện tử cho nhà hàng tên TechMenu (không hoạt động ở VN);
  Smart Tech Menu (Mỹ, menu điện tử + POS) tên gần giống.
- **Tên miền** (Nhân Hòa, 29/09/2026): `techmenu.vn` còn trống — 450.000 đ/năm; `techmenu.com.vn` còn trống — 350.000 đ/năm;
  `techmenu.com`, `techmenu.net` đã có chủ.
- Việc cần làm (chưa làm): mua `techmenu.vn` + `techmenu.com.vn` (đứng tên công ty); tra nhãn hiệu tại Cục Sở hữu trí tuệ và nộp đơn đăng ký
  nhãn hiệu "TechMenu" tại VN trước khi in tài liệu, bán rộng.

## Nơi đặt bản phát hành (21-03, phát hiện khi build 29/09/2026)

Bộ cài build ra nặng **111,6 MB** — vượt trần **50 MB/tệp** của Supabase Storage gói miễn phí (0055), nên **không** đặt ở
Supabase như bộ cài cầu in cũ. Code không gắn cứng nơi đặt: app và nút tải chỉ gọi `/api/desktop/update/<tệp>` và
`/api/desktop/latest` của app web, hai route này chuyển tiếp tới `DESKTOP_RELEASE_BASE` (Vercel env). **Đã chốt (chủ dự án, 29/09/2026)**: mục **Releases của chính repo dự án** `lecuongg242-cloud/restaurantManagement` (công khai), tag
`thu-ngan-v<phiên bản>`, `DESKTOP_RELEASE_BASE=https://github.com/lecuongg242-cloud/restaurantManagement/releases/latest/download`.
Bản 1.0.0 đã đăng 29/09/2026 (sha512 khớp bản build). Release "latest" của repo phải luôn là bản app. Chưa cấu hình biến ⇒
nút tải và mục cài app ở `/huong-dan-cai-dat` tự ẩn, app không tự cập nhật (không hỏng gì).

## Hệ quả khác

- Đợt 21-03 đổi tiêu chí: "cài trên máy Windows sạch ≤ 5 phút **theo hướng dẫn** (có bước qua SmartScreen); bản mới tự cập
  nhật ≤ 1 giờ **không hiện cảnh báo**".
- Đổi tên "POSMenu" → "TechMenu" ở trang `/huong-dan-cai-dat` và tài liệu: việc riêng, làm khi xếp lịch P21 (hoặc sớm hơn nếu
  chủ dự án yêu cầu).
- Chi phí duy trì: nâng phiên bản Electron định kỳ (~mỗi quý) để cập nhật bảo mật Chromium; hỗ trợ lỗi cài đặt.
