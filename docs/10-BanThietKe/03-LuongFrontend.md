# LUỒNG FRONTEND CHI TIẾT (màn hình → màn hình) — V1

> Phiên bản 1.0 — 21/07/2026. Nguồn: `00-TongThe.md` §3 (5 luồng), `01-KyThuatChiTiet.md`, `02-FrontendChiTiet.md`, QD-005/006.
> Mỗi luồng: danh sách màn hình, bước thao tác, trạng thái dữ liệu tương ứng, component chính. Ký hiệu `→` = điều hướng, `⟳` = cập nhật realtime.

---

## A. APP KHÁCH — Gọi món QR (Luồng 1) `(customer)`

**Màn hình:**
| # | Màn | Route | Component chính |
|---|---|---|---|
| A1 | Menu theo bàn | `/r/[slug]/menu?t=[qr_token]` | header(logo+bàn+giỏ), chip danh mục, `menu-item-card` |
| A2 | Chi tiết/tùy chọn món | sheet trên A1 | `modifier-sheet` (nhóm min/max/required), `qty-stepper`, ghi chú |
| A3 | Giỏ | sheet | `cart-sheet`: dòng món+tùy chọn+SL, tổng tạm, nút "Gửi order" |
| A4 | Xác nhận đã gửi | overlay/A1 | thông báo "Đã gửi, chờ nhân viên xác nhận", `order-status-stepper` |
| A5 | Theo dõi món | `/r/[slug]/order/[id]` | `order-status-stepper` ⟳ (pending→confirmed→preparing→ready→served) |

**Bước:**
1. Khách quét QR → A1 (server đọc `slug`+`qr_token` → tenant + bàn, mở/ghép **table_session** nếu chưa có). Menu chỉ hiện món `is_available`.
2. Chạm món → A2: chọn tùy chọn (validate min/max/required), SL, ghi chú → "Thêm vào giỏ".
3. Chạm giỏ nổi → A3: soát lại → "Gửi order".
4. **Order tạo với `status=pending_confirm`** (chưa xuống bếp — D8) → A4. Đếm chạm: món→+, giỏ, gửi ≈ ≤6 chạm (tiêu chí #7).
5. A5 cập nhật ⟳ khi nhân viên duyệt và bếp đổi trạng thái. Khách có thể gọi thêm (lặp A1–A4 trong cùng phiên bàn).

**Trạng thái rỗng/lỗi:** menu trống → "Nhà hàng đang cập nhật thực đơn"; món hết → thẻ mờ + nhãn "Hết"; mất mạng → banner "Mất kết nối, thử lại".

---

## B. APP KHÁCH — Đặt bàn online (Luồng 3) `(customer)`

| # | Màn | Route |
|---|---|---|
| B1 | Landing đặt bàn | `/r/[slug]/dat-ban` (hero Fraunces + sunset) |
| B2 | Form đặt bàn | cùng trang | `text-input` (tên, SĐT), chọn ngày/giờ, số người, ghi chú |
| B3 | Xác nhận gửi | overlay | "Đã gửi, chờ nhà hàng xác nhận" |

**Bước:** B1→B2 điền → gửi → tạo `reservations status=pending` (D10) → B3. Không auto-confirm; khách nhận trạng thái sau (V1 hiển thị "chờ duyệt"; thông báo qua điện thoại do nhà hàng chủ động).

---

## C. APP KHÁCH — Đặt món mang về/giao (Luồng 4) `(customer)`

| # | Màn | Route |
|---|---|---|
| C1 | Menu online | `/r/[slug]/dat-mon` | như A1 nhưng không gắn bàn |
| C2 | Giỏ + hình thức | sheet | chọn **mang về**/**giao**; nếu giao: địa chỉ; SĐT + tên bắt buộc |
| C3 | Xác nhận | overlay | "Đơn đã gửi, chờ xác nhận" + mã đơn |
| C4 | Theo dõi đơn | `/r/[slug]/order/[id]` | `order-status-stepper` ⟳ |

**Bước:** chọn món → C2 nhập liên hệ → tạo `orders channel=takeaway|delivery, status=pending_confirm`, `customer_contact` jsonb (D11) → C3/C4. Không phí giao/khung giờ (V1).

---

## D. POS NHÂN VIÊN (Luồng 2) `(staff)/pos`

| # | Màn | Route | Component |
|---|---|---|---|
| D0 | Đăng nhập trạm | `/r/[slug]/pos/login` | đăng nhập station 1 lần/thiết bị |
| D1 | Chọn nhân viên (PIN) | overlay | `pin-pad` (chọn tên + PIN 4 số) |
| D2 | Sơ đồ bàn | `/r/[slug]/pos` | tab khu vực, lưới `table-tile` (màu status) ⟳ |
| D3 | Order QR chờ duyệt | drawer | danh sách order `pending_confirm` ⟳ + nút "Duyệt"/"Từ chối" |
| D4 | Panel bàn | `/r/[slug]/pos?table=[id]` | `order-panel`: món của phiên, thêm món, ghi chú |
| D5 | Thêm món (thay khách) | sheet | menu + `qty-stepper` (source=staff, vào thẳng confirmed) |
| D6 | Tách/gộp bill | `bill-split-panel` | kéo món giữa các bill, chia đều N, gộp bàn |
| D7 | Thanh toán | `payment-dialog` | tiền mặt/CK + số tiền + các dòng giảm giá/phí/VAT → đóng bill |
| D8 | In hóa đơn | `/print/receipt/[billId]` | `receipt-print` (window.print) |

**Bước chính:**
1. Thiết bị đăng nhập station (D0) 1 lần. Mỗi thao tác: chọn nhân viên + PIN (D1) — ghi `staff_id`.
2. D2 sơ đồ bàn ⟳. Bàn có khách = `occupied` (cream).
3. **Duyệt order QR (D3, D8-decision):** order khách vào `pending_confirm` → nhân viên "Duyệt" → `confirmed` → **xuống KDS + tạo phiếu bếp** (bấm in phiếu bếp `/print/kitchen/[orderId]`). "Từ chối" → `cancelled` + lý do.
4. Chọn bàn → D4. Thêm món thay khách (D5) → confirmed ngay.
5. **Hủy/sửa món đã gửi (D9):** cần PIN quyền manager/cashier + ghi lý do.
6. Đóng bill: D6 (nếu tách/gộp) → D7 thanh toán (công thức tổng: subtotal−giảm+phí+VAT) → in D8 → **đóng table_session**, bàn về `available`/`cleaning`.

**Realtime:** ⟳ order QR mới, thay đổi trạng thái bàn/món.

---

## E. KDS BẾP (Luồng 1 phần bếp) `(staff)/kds`

| # | Màn | Route | Component |
|---|---|---|---|
| E0 | Đăng nhập trạm bếp | `/r/[slug]/kds/login` | station |
| E1 | Hàng đợi bếp | `/r/[slug]/kds` | 3 cột: Chờ làm · Đang làm · Sẵn sàng; `kds-ticket` ⟳ |

**Bước:**
1. Chỉ item `confirmed` mới xuất hiện (sau khi POS duyệt order QR / POS tạo).
2. Vé hiện: bàn, giờ (đồng hồ đếm lên), món+SL+tùy chọn+ghi chú.
3. Bếp bấm "Bắt đầu" (item→`preparing`, cột giữa) → "Xong" (item→`ready`, cột phải). Order lên `ready` khi mọi item `ready`.
4. Vé quá ngưỡng phút → `status-late` (đỏ). Phục vụ mang món → POS đánh `served`.
5. Mục tiêu: item hiện ≤3s sau khi confirmed (tiêu chí #2/ORDER-04).

---

## F. ADMIN (Luồng 5 + cấu hình) `(admin)`

| Mục sidebar | Route | Màn hình chính |
|---|---|---|
| Dashboard | `/r/[slug]/admin` | `report-stat` (doanh thu ngày/tuần/tháng), `revenue-chart`, `top-items-list`, tách theo phương thức TT |
| Menu | `/admin/menu` | bảng danh mục/món, form CRUD, upload ảnh, toggle "hết món", quản lý modifier groups/options |
| Bàn & QR | `/admin/tables` | CRUD khu vực/bàn, nút "Xuất QR" (trang in QR từng bàn) |
| Nhân viên | `/admin/staff` | CRUD membership, vai trò, đặt PIN |
| Đặt bàn | `/admin/reservations` | danh sách theo ngày, `reservation-row` duyệt/từ chối |
| Đơn online | `/admin/online-orders` | danh sách đơn takeaway/delivery, đổi trạng thái tới hoàn tất |
| Cài đặt | `/admin/settings` | logo+tên, %phí phục vụ, %VAT, footer hóa đơn, bật/tắt duyệt-order-QR |

**Luồng duyệt đặt bàn:** `reservations` pending → admin xem theo ngày → "Xác nhận"/"Từ chối" (ghi `decided_by`).
**Luồng menu:** tạo danh mục → tạo món (ảnh ≤2MB, giá) → gắn modifier group → toggle hết món realtime tới app khách.
**Onboarding (TENANT-03):** wizard 4 bước (thông tin nhà hàng → menu mẫu → bàn+QR → xong) mục tiêu ≤15'.

---

## G. SUPER-ADMIN `(super)`

| # | Màn | Route |
|---|---|---|
| G1 | Danh sách tenant | `/super` |
| G2 | Tạo nhà hàng | `/super/new` | form: tên, slug, tạo owner (email) |

Tạo `tenants` + `memberships(owner)` → gửi thông tin đăng nhập cho chủ nhà hàng. Chưa gói/subscription (D13).

---

## H. Xuyên suốt (cross-cutting)

- **Trạng thái tải/rỗng/lỗi**: mọi danh sách có skeleton khi tải, empty-state có hướng dẫn, error-state có nút thử lại.
- **Realtime ⟳**: POS (order QR mới, trạng thái bàn/món), KDS (item confirmed/đổi trạng thái), app khách theo dõi món. Kênh lọc theo `tenant_id`+trạm.
- **Điều hướng theo vai trò (RBAC)**: sau đăng nhập, route theo `role` — owner/manager→admin; cashier/waiter→POS; kitchen→KDS; khách→customer (không auth).
- **In**: mọi lệnh in mở route `/print/*` khổ nhiệt rồi `window.print()` (V1); PrintAdapter chừa sẵn cầu in tự động (D1).
- **PWA**: manifest + cài được cho customer/POS/KDS (online-only, D14).

## Bản đồ luồng ↔ yêu cầu
A→ORDER-01/02, TABLE-02, PRINT-02 · D→ORDER-02/03/05, BILL-01..04, PRINT-03 · E→ORDER-04 · F→MENU-*, TABLE-01, RESV-02, ONLINE-01, REPORT-* , TENANT-03 · B/C→RESV-01, ONLINE-01 · G→TENANT-01.
