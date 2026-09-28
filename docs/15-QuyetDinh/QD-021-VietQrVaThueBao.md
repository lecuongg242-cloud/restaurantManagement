# QD-021 — VietQR theo hóa đơn và thuê bao gia hạn tay

**Ngày:** 27/09/2026 · **Trạng thái:** ĐỀ XUẤT — hướng đi đã được chủ dự án chốt (27/09/2026); 3 con số ở
"Chưa quyết" chờ chốt trước khi làm 13-03.
**Kế hoạch:** `30-KeHoach/P13/` · **Yêu cầu:** PAY-01..03, SUB-01..04 · **Liên quan:** QD-007 D-P4-1,
QD-012 §2 (khóa quán), `50-PhienBan/V2-KeHoach.md` §V3-A, `00-TongQuan/PhanTichDoiThu.md`

## Bối cảnh

Chuẩn bị bán cho quán thứ hai trở đi (phân tích đối thủ 27/09/2026). Hai thứ đang thiếu:

- **Thu chuyển khoản:** `payments.method` chỉ có `cash | transfer` và chuyển khoản chỉ là *ghi nhận* (QD-007).
  Thu ngân đọc số tài khoản, khách tự gõ số tiền → dễ sai tiền, sai nội dung, khó đối soát. Mọi đối thủ đều
  có mã VietQR theo số tiền từ gói rẻ nhất.
- **Thu tiền thuê bao:** chưa có khái niệm hạn dùng. Chỉ có công tắc tay `tenants.status = suspended` (0039).
  Không có ngày hết hạn thì không có nhắc, không có khóa tự động, không biết quán nào nợ.

## Chủ dự án đã chốt (27/09/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| C1 | Báo tiền về thế nào? | **Dùng thiết bị/app của ngân hàng** (loa, thông báo). Hệ thống không nối ngân hàng |
| C2 | Chia gói cước? | **Không.** Một gói: gia hạn là dùng được toàn bộ tính năng |
| C3 | Hóa đơn điện tử có trong P13? | **Không** — cần liên hệ nhà cung cấp; tách sang P14 (QD-022) |
| C4 | Màn hình bếp | Giữ nguyên (chỉ xem + báo hết món); phiếu in giấy là chính. Không đầu tư thêm |

## Quyết định (đề xuất)

| # | Việc | Chọn | Vì sao | Phương án bị loại |
|---|---|---|---|---|
| D1 | Sinh mã VietQR | **Tự dựng chuỗi theo chuẩn EMVCo/NAPAS** (TLV + CRC16) trong code, vẽ bằng thư viện `qrcode` đã có | 0đ, không phụ thuộc mạng ngoài lúc thanh toán, test được bằng chuỗi mẫu | Gọi `img.vietqr.io` — phụ thuộc bên thứ ba ngay lúc thu tiền; cổng Casso/SePay — tốn phí, trái C1 |
| D2 | Xác nhận tiền về | **Thu ngân bấm "Đã nhận"** sau khi loa/app ngân hàng báo — như nút chuyển khoản hiện nay | Đúng C1; không thêm tích hợp | Webhook ngân hàng tự đóng bill — để sau nếu quán yêu cầu |
| D3 | Tài khoản nhận | **Một tài khoản mỗi quán**, lưu trong `tenants.settings` (mã ngân hàng BIN, số TK, tên chủ TK). Chưa cấu hình → nút QR ẩn, chuyển khoản vẫn ghi nhận như cũ | Quán nhỏ có một TK; không làm vỡ luồng hiện tại | Nhiều TK/chọn TK khi thu — chưa có ai cần |
| D4 | Nội dung chuyển khoản | Mã ngắn không dấu, **duy nhất trong quán ≥ 1 năm**, ≤ 25 ký tự, dựng từ `bill_no` + ngày (ví dụ `HD12 2709`) | `bill_no` reset mỗi ngày nên phải kèm ngày; ngân hàng cắt nội dung dài | UUID — quá dài, khách không đọc được |
| D5 | QR hiện ở đâu | **Chỉ in trên hóa đơn chưa thanh toán** (in trình duyệt + ảnh PNG của cầu in); **không** hiện trên màn POS. Bật mặc định khi quán đã khai tài khoản, owner tắt được | Chủ dự án chốt 27/09/2026: "cần in được mã QR ra hóa đơn, không cần ra màn hình". Khách quét trên giấy tại bàn là cách quán VN dùng nhiều nhất | QR trên màn POS (xoay màn cho khách) — chủ dự án không cần |
| D6 | Mô hình thuê bao | Cột **`tenants.paid_until`** (ngày) + bảng **`subscription_payments`** (nhật ký gia hạn: số tiền, số tháng, người ghi, ghi chú). `paid_until` rỗng = **không giới hạn** (qt-food và quán demo hiện có) | Đơn giản nhất đủ để nhắc và khóa; nhật ký để đối soát | Bảng `plans/subscriptions` của V3-A — thừa khi chỉ có một gói (C2) |
| D7 | Khóa khi quá hạn | Hết `paid_until` + **ân hạn** → khóa **đúng như `suspended`** (đi qua `auth_tenant_ids()` và `lib/tenant/active.ts`), **không xóa dữ liệu**; gia hạn → mở ngay | Dùng lại một điểm chặn đã có test (0039), không rải điều kiện | Khóa mềm chỉ đọc — phải sửa từng màn; khóa ngay không ân hạn — quán mất bán giữa ca |
| D8 | Gia hạn | **Tay:** chủ quán mở trang **Gia hạn** (admin) → thấy hạn dùng + **mã VietQR tới tài khoản của nền tảng** (dùng lại D1, nội dung `GH {slug}` — đổi 27/09/2026 thành `GIAHAN {MÃQUÁN} {n}T` cho rõ gói) → chuyển khoản → super-admin ghi nhận ở `/super` → `paid_until` tăng | Không cổng thanh toán, 0 phí; dùng lại D1 | Cổng tự động (PayOS/VNPay) — khi ≥ ~20 quán, mở QD riêng |

## Chưa quyết — chặn 13-03, không chặn 13-01/13-02

| # | Việc | Đề xuất mặc định |
|---|---|---|
| U1 | Nhắc trước hạn bao nhiêu ngày | **Chốt 27/09/2026: 7 ngày** (`REMIND_DAYS`) |
| U2 | Ân hạn sau hạn bao nhiêu ngày | **Chốt 27/09/2026: 7 ngày** (banner đỏ nhưng vẫn bán); ngày hạn đổi lúc **04:00** giờ VN để không khóa giữa ca đêm (0057, `GRACE_DAYS`) |
| U3 | Giá một tháng / một năm; tài khoản nhận của nền tảng | Chủ dự án chốt; lưu ở cấu hình nền tảng, không cứng trong code — **code sẵn**: biến `PLATFORM_*` (`.env.local.example`), chờ điền giá trị trên Vercel |

## Hệ quả

- `auth_tenant_ids()` thêm điều kiện hạn dùng ⇒ phải chạy lại ma trận RLS (TENANT-05) và test khóa (TENANT-06).
  Điều kiện so ngày theo **giờ Việt Nam**, không theo UTC (bài học `BUG-GioLechMuiGio`).
- Khóa quán giữa ca là rủi ro doanh thu thật ⇒ nhắc phải hiện cho **owner/manager** ở admin **và** POS.
- Mục V3-A (gói, cổng thanh toán, đăng ký tự phục vụ) **vẫn để V3**; QD này chỉ thay phần "gia hạn/khóa thủ công".
