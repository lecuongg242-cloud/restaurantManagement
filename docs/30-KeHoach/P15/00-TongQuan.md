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

## Đối thủ làm thế nào (tra 27/09/2026)

Nguồn: trang hướng dẫn chính thức, đọc qua công cụ tóm tắt; chỗ ghi (?) là chưa xác minh được.

| Việc | KiotViet | Sapo FnB | CUKCUK | iPOS FABi | POS365 |
|---|---|---|---|---|---|
| Tạo chi nhánh | Thiết lập › Cửa hàng › Quản lý chi nhánh › **+ Tạo chi nhánh** (tên, SĐT, địa chỉ); **Ngừng hoạt động / Cho phép hoạt động**; chặn khi vượt số chi nhánh đã mua [1] | Mua thêm → hệ thống tự tạo; Cấu hình › Quản lý chi nhánh [5] | Tích **"Là chuỗi nhà hàng"**, rồi Thiết lập hệ thống › Nhà hàng › **Thêm** [8] | Thương hiệu › Thành phố › Cửa hàng [10] | **Thêm mới chi nhánh** ở màn Tổng quan [12] |
| Chuyển chi nhánh | (?) | Màn **"Chọn cửa hàng"** sau đăng nhập [6] | Chỉ thấy nhà hàng được phân quyền | (?) | (?) |
| Thực đơn | **Một danh mục chung**; tab **"Chi nhánh"** trên món để bật/tắt bán ở từng chi nhánh [2] | Quản lý tập trung (?) | **Mỗi nhà hàng một thực đơn**, chép bằng **"Sao chép nhanh sang nhà hàng khác"** [9] | Thực đơn thương hiệu + **"Sửa thực đơn tại cửa hàng"**, **"Sao chép thực đơn"** [11] | (?) |
| Giá riêng chi nhánh | **Bảng giá**, "Phạm vi áp dụng": Toàn hệ thống / chi nhánh [3] | Bảng giá theo chi nhánh (bản Omni) | Theo thực đơn riêng từng nhà hàng | Cấu hình giá theo nguồn | Bảng giá có **"Giới hạn chi nhánh"** [13] |
| Báo cáo | Gộp nhiều chi nhánh (?) | **"Báo cáo theo chi nhánh"**: so sánh doanh thu, lợi nhuận [7] | Từng nhà hàng hoặc gộp cả chuỗi [8] | Lọc/biểu đồ so sánh theo cửa hàng [10] | Theo chi nhánh hoặc toàn hệ thống |
| Nhân viên | Gán chi nhánh + vai trò (?) | Gán vai trò | **Một nhân viên, chọn các nhà hàng được quản lý** [8] | "Quyền toàn thương hiệu" / theo cửa hàng | (?) |
| Khách chọn chi nhánh | (?) | Mỗi chi nhánh một trang bán online | (?) | iPOS Booking (?) | (?) |
| Giá thêm chi nhánh | **+270k / +375k mỗi chi nhánh** [4] | Gói Omni gồm sẵn 3 chi nhánh | **Mỗi nhà hàng thêm = đúng giá gói**, không giảm [9b] | Báo giá riêng | (?) |

**Điểm chung:** (1) một tài khoản quản cả chuỗi, chi nhánh là đơn vị con, số chi nhánh bị giới hạn theo gói đã trả;
(2) thực đơn chung + tùy chỉnh theo chi nhánh (bật/tắt món); (3) giá riêng chi nhánh qua **bảng giá** có phạm vi
chi nhánh; (4) báo cáo từng chi nhánh hoặc gộp, có báo cáo so sánh; (5) nhân viên được gán **một hoặc nhiều** chi
nhánh; (6) mỗi chi nhánh thêm tính **gần bằng giá gói**, không thấy bậc giảm; (7) trang khách chọn chi nhánh hiếm.

**Chỗ plan P15 đang khác đối thủ (cần chủ dự án chốt):** nhân viên chỉ một chi nhánh (QD-023 D7, đối thủ cho nhiều);
giảm giá từ chi nhánh thứ 2 (QD-023 D9/U1, đối thủ không giảm); đồng bộ thực đơn bằng nút "Đồng bộ" (D4) thay vì
một danh mục chung có bật/tắt theo chi nhánh.

[1] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thiet-lap/quan-ly-chi-nhanh/ ·
[2] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/danh-muc-hang-hoa-web-fnb/ ·
[3] https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bar-cafe-nha-hang/thiet-lap-gia-web-fnb/ ·
[4] https://www.kiotviet.vn/phi-dich-vu ·
[5] https://help.sapo.vn/cau-hinh-quan-ly-chi-nhanh-them-moi-xem-va-cap-nhat-thong-tin-ve-chi-nhanh ·
[6] https://help.sapo.vn/dang-nhap-tai-khoan-chu-cua-hang-vao-trang-quan-tri-sapo-fnb ·
[7] https://help.sapo.vn/xem-bao-cao-ban-hang-theo-chi-nhanh-tren-sapo ·
[8] https://helpv2.cukcuk.vn/vi/kb/1071200_chuyen_nha_hang_sang_dang_chuoi ·
[9] https://helpv2.cukcuk.vn/vi/kb/1060100_them_mon_an · [9b] https://www.cukcuk.vn/bang-gia/ ·
[10] https://fabi-docs.ipos.vn/ ·
[11] https://huongdan.ipos.vn/docs/tai-lieu-cap-nhat-tinh-nang-fabi/fabi-noi-dung-da-cap-nhat-trong-t8-2023/1-tuy-chinh-nhom-mon-va-may-in-cho-tung-cua-hang/ ·
[12] https://www.pos365.vn/docs/chi-nhanh-2390.html ·
[13] https://www.pos365.vn/thiet-lap-bang-gia-trong-phan-mem-quan-ly-ban-hang-4192.html

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
