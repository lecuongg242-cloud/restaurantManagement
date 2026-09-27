# P15 — Chuỗi nhiều chi nhánh

> Lập 27/09/2026. Plan là hợp đồng + nghiệm thu, không phải bản nháp code.
> Quyết định: `15-QuyetDinh/QD-023` (**chờ chốt D1 và U1–U3**) · Yêu cầu: BRANCH-01..08
> Phụ thuộc: P13 (hạn dùng theo tenant). Không phụ thuộc P14.

## Vì sao P15 là việc này

Đối thủ đều bán chuỗi (KiotViet, Sapo từ gói Pro; iPOS mạnh nhất). Chủ dự án cần: **một tài khoản quản nhiều
quán, báo cáo gộp, thực đơn dùng chung.** Hôm nay 1 tenant = 1 quán, không có khái niệm thương hiệu.

**P15 kết thúc bằng: chủ chuỗi đăng nhập một lần, chuyển qua lại giữa các chi nhánh, xem doanh thu gộp và so
sánh chi nhánh, sửa thực đơn một chỗ rồi đồng bộ; nhân viên mỗi chi nhánh chỉ thấy chi nhánh mình; khách chọn
chi nhánh trước khi đặt online.**

## Các plan

| Plan | Yêu cầu | Phụ thuộc | Giá trị khi dừng ở đây |
|---|---|---|---|
| 15-01 Thương hiệu + tạo chi nhánh + một tài khoản chủ | BRANCH-01, BRANCH-02 | không | Super-admin dựng được chuỗi; chủ vào được mọi chi nhánh |
| 15-02 Bộ chọn chi nhánh + Tổng quan chuỗi | BRANCH-03 | 15-01 | Chủ chuyển chi nhánh một chạm, thấy hôm nay cả chuỗi |
| 15-03 Đồng bộ thực đơn từ chi nhánh gốc | BRANCH-04 | 15-01 | Sửa thực đơn một chỗ |
| 15-04 Báo cáo gộp + so sánh chi nhánh | BRANCH-05 | 15-01 | Báo cáo chuỗi khớp tổng từng chi nhánh |
| 15-05 Trang thương hiệu cho khách `/b/{brand}` | BRANCH-06 | 15-01 | Khách chọn chi nhánh để đặt online/đặt bàn |
| 15-06 Cách ly giữa chi nhánh + di trú | BRANCH-07 | 15-01..05 | Bằng chứng không rò chéo chi nhánh |
| 15-07 Thuê bao theo thương hiệu | BRANCH-08 | 15-01, P13 13-03/13-04 | Chủ chuỗi gia hạn một lần, một ngày hết hạn |

15-02..15-05 song song được sau 15-01. 15-06 là cổng nghiệm thu cuối (test RLS mở rộng + chạy trên dữ liệu thật).

## Phát hiện khi rà code (27/09/2026)

- Không có khái niệm `brand/branch/organization` nào trong code. `tenants.subdomain` có sẵn nhưng tắt (TENANT-04).
- Phiên **không** lưu tenant: `middleware.ts:29-38` lấy slug từ URL; `lib/auth/session.ts:36-73` tra membership
  theo slug ⇒ chuyển chi nhánh chỉ là đổi URL.
- Owner một tài khoản cho nhiều tenant đã chạy được về dữ liệu (`memberships` unique `(tenant_id, user_id)`), nhưng
  `app/super/actions.ts:109-122` **đặt lại mật khẩu** khi tái dùng email — phải sửa.
- Email nhân viên unique toàn cục (`0017_staff_accounts.sql:12-15`) ⇒ nhân viên một chi nhánh (QD-023 D7).
- Menu: `menu_items.base_price` (0004:26), `is_available` (0004:28), `modifier_options.price_delta/is_available`
  (0006:29-30); cache gắn tag theo tenant (`lib/menu/cache.ts:25`) ⇒ đồng bộ xong phải xóa cache từng chi nhánh.
- 29 RPC báo cáo/kho đều `security invoker` + `tenant_id = p_tenant` ⇒ bản mảng tenant giữ được quy ước.
- `tables.qr_token` unique toàn cục (0007:24) ⇒ QR tại bàn không cần đổi.

## Ràng buộc xuyên suốt

- **Quán lẻ không thấy gì khác.** Ảnh chụp trước/sau admin + POS của qt-food là cổng chặn của mỗi plan.
- Không thêm cột chi nhánh vào bảng vận hành (QD-023 D1). Nếu một plan thấy cần → dừng, mở lại QD.
- Mọi RPC mới: `revoke from public, anon` + `grant authenticated`; đổi cột trả về thì drop + create (bài học 0025, 0036/0037, 0049).
- Test chạy dưới `TZ=UTC`; mỗi plan có `-SUMMARY.md`.

## Không nằm trong P15

| Việc | Vì sao |
|---|---|
| Kho trung tâm, chuyển kho giữa chi nhánh | P20 (mua hàng/công nợ) |
| Đồng bộ định lượng/nguyên liệu | QD-023 U3 |
| Nhân viên làm nhiều chi nhánh một tài khoản | QD-023 D7 |
| Khách hàng/tích điểm dùng chung chuỗi | P16 (danh sách khách) + P19 (voucher) |
| Tên miền riêng, màu thương hiệu | V3-B |
