# P13 — VietQR theo hóa đơn và thuê bao gia hạn tay

> Lập 27/09/2026. Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-021` · Yêu cầu: PAY-01..03, SUB-01..04 · Bối cảnh: `00-TongQuan/PhanTichDoiThu.md`

## Vì sao P13 là việc này

Chuẩn bị bán cho quán thứ hai trở đi. So với đối thủ (KiotViet, Sapo, CUKCUK, iPOS), hai thứ chặn bán ngay:

- **Thu chuyển khoản bằng tay:** thu ngân đọc số tài khoản, khách tự gõ số tiền. Đối thủ nào cũng có QR theo
  số tiền từ gói rẻ nhất.
- **Không thu được tiền thuê bao:** không có hạn dùng, không nhắc, không khóa tự động (chỉ có công tắc
  `suspended` bấm tay).

Hóa đơn điện tử cũng chặn bán, nhưng cần liên hệ nhà cung cấp trước ⇒ tách sang **P14** (QD-022).

**P13 kết thúc bằng: khách quét QR trên màn POS hoặc trên hóa đơn giấy, app ngân hàng điền sẵn đúng số tiền
và nội dung; quán có hạn dùng, được nhắc trước, tự khóa khi quá ân hạn, và mở lại ngay khi super-admin ghi
nhận tiền gia hạn.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 13-01 VietQR: dựng mã + cấu hình tài khoản + hộp thanh toán POS | PAY-01, PAY-02, PAY-03 (phần POS) | không | Thu ngân xoay màn cho khách quét, đúng tiền |
| 13-02 QR trên phiếu tạm tính và hóa đơn in | PAY-03 (phần in) | 13-01 | Khách quét trên giấy tại bàn, không cần xoay màn |
| 13-03 Hạn dùng, nhắc, khóa tự động | SUB-01, SUB-02, SUB-03 | không (chặn bởi QD-021 U1, U2) | Nền tảng có đòn bẩy thu tiền, không bấm tay |
| 13-04 Gia hạn tay: trang Gia hạn + ghi nhận ở `/super` | SUB-04 | 13-01, 13-03 | Vòng thu tiền thuê bao khép kín |

**Hai nhánh song song:** VietQR (13-01 → 13-02) và thuê bao (13-03). 13-04 ghép hai nhánh.

| Plan | Migration | Ghi chú |
|---|---|---|
| 13-01 | — | Tài khoản nhận nằm trong `tenants.settings` (jsonb), không cần cột mới |
| 13-02 | — | Chỉ giao diện in + ảnh PNG |
| 13-03 | `0057_subscription` | `tenants.paid_until`, hàm "quán còn dùng được", **thay** `auth_tenant_ids()` |
| 13-04 | `0058_subscription_payments` | Bảng nhật ký gia hạn + RLS |

## Phát hiện khi rà code (27/09/2026)

- `payments.method` chỉ cho `cash | transfer` (`0012_bills_core.sql:59`). VietQR **vẫn là `transfer`**, không
  cần đổi ràng buộc, `pay_bill` (0035) giữ nguyên nghiệp vụ.
- `bills.bill_no` được cấp **lúc tạo bill** (`lib/billing/bill.ts:201, 318, 950`), không phải lúc trả ⇒ có sẵn
  để dựng nội dung chuyển khoản trước khi thu. `bill_no` reset mỗi ngày ⇒ nội dung phải kèm ngày.
- Thư viện `qrcode` đã có (`lib/tables/qr.ts`, in QR bàn) ⇒ không thêm gói npm.
- Hộp thanh toán: `components/pos/PaymentDialog.tsx:198-199` (hai nút Tiền mặt / Chuyển khoản).
- Hóa đơn có view model dùng chung `lib/billing/receipt-view.ts` → `components/print/ReceiptDoc.tsx` (trình
  duyệt) và `lib/print/anh-phieu.tsx` (ảnh PNG, P12). QR phải đi qua **cùng** view model.
- Cài đặt quán: `lib/tenant/settings.ts` (`parseSettings` / `serializeSettings`, có clamp) ⇒ thêm khối `bank`.
- Khóa quán có **hai** điểm chặn, cả hai chỉ nhìn `status = 'active'`:
  `auth_tenant_ids()` (`0039_suspend_gate.sql`) cho phiên đăng nhập, và `activeTenantBySlug`
  (`lib/tenant/active.ts`) cho bề mặt khách chạy service-role. Hạn dùng phải vào **cả hai**, cùng một định nghĩa.
- Đã có test khóa quán: `tests/rls/suspend.test.ts`, `tests/tenant/active.test.ts`, ma trận `tests/rls/matrix.test.ts`.

## Ràng buộc xuyên suốt

- **qt-food đang bán thật:** migration 13-03 để `paid_until` rỗng cho mọi quán hiện có ⇒ không quán nào bị
  khóa khi áp. Kiểm bằng truy vấn trước/sau trên production.
- Không đổi nghiệp vụ tiền (`pay_bill`, `lib/billing/compute`) — QR chỉ **hiển thị** số tiền đã tính.
- Ngày hạn tính theo **giờ Việt Nam**; test chạy dưới `TZ=UTC` (bài học `BUG-GioLechMuiGio`).
- Không log số tài khoản đầy đủ ra Sentry/console ngoài chỗ cần hiển thị.
- Mỗi plan có `-SUMMARY.md` kèm test output và ảnh (màn hình, giấy in, màn hình app ngân hàng khi quét).

## Không nằm trong P13

| Việc | Vì sao |
|---|---|
| Tự xác nhận tiền về (webhook ngân hàng, Casso/SePay) | QD-021 C1 — dùng loa/app ngân hàng |
| Cổng thanh toán tự động cho thuê bao | Khi ≥ ~20 quán; QD riêng |
| Chia gói cước, hạn mức | QD-021 C2 — một gói |
| Đăng ký tự phục vụ, dùng thử tự động | V3-A |
| Hóa đơn điện tử, sổ S1a/S2a | P14 (QD-022) |
| KDS tương tác | QD-021 C4 — giữ nguyên |
