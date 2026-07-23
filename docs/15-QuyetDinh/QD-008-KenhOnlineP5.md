# QD-008 — Quyết định Kênh online (P5)

**Ngày:** 22/07/2026 · **Trạng thái:** CHỐT
**Nguồn:** Roadmap P5 · `20-DanhSachYeuCau/00-Requirements.md` (RESV-01, RESV-02, ONLINE-01) · `10-BanThietKe/01-KyThuatChiTiet.md` (§3.3 orders/channel, §3.5 bill) · trao đổi với chủ dự án 22/07/2026.
**Bối cảnh:** Schema `orders` (0008) ĐÃ có sẵn `channel ∈ {dine_in, takeaway, delivery}`, `customer_contact jsonb`, `table_session_id` nullable — nền cho đơn online có sẵn; P3 mới chỉ dùng `dine_in`. Đặt bàn chưa có bảng. QD này chốt phạm vi + các điểm rẽ nhánh P5, KHÔNG đổi mô hình order/bill đã thiết kế.

## Các quyết định

### D-P5-1 — Đơn online = TÁI DÙNG luồng bill P4 (thu tiền + hóa đơn + vào doanh thu)
Đơn mang về/giao chạy hết vòng đời trạng thái tới `completed`; khi giao/nhận, thu tiền qua **cùng luồng bill P4**: `openBillForOrder(orderId)` gom `order_items` của đơn thành 1 bill (`table_session_id=null`, `online_order_id=orderId`) → `payBill` (mặt/CK) → in hóa đơn 80mm → **vào doanh thu dashboard** như dine-in.
- **Lý do:** chủ dự án cần doanh thu khớp cả kênh online, tránh 2 mô hình tiền song song. Mô hình `bills/payments` đã chịu được `table_session_id=null` (dùng cho gộp bàn ở 04-02) nên chỉ cần thêm liên kết `bills.online_order_id`.
- **KHÔNG làm ở V1:** tách/gộp/chia đều cho đơn online (1 đơn = 1 bill, không tách); phí giao + gán tài xế (ONLINE-01 ghi rõ "không phí giao/tài xế"); cổng thanh toán online (thu khi nhận/giao — cash/transfer ghi nhận như D-P4-1).
- **Chừa chỗ:** phí giao (`delivery_fee`) + VietQR động là hạng mục V1.x.

### D-P5-2 — Đặt bàn = CHỈ danh sách + duyệt (không giữ bàn, không mở phiên)
Reservation là bản ghi `pending → confirmed | rejected`; quản lý xem **danh sách theo ngày** và xác nhận/từ chối. Khi khách tới, nhân viên xếp bàn **thủ công** qua QR/POS như bình thường (không tự mở `table_session` từ reservation).
- **Lý do:** đúng RESV-01/02 ("gửi đặt bàn → pending"; "xác nhận/từ chối; thấy danh sách theo ngày"); đơn giản nhất, không đụng `table_sessions`, không rủi ro giữ/nhả bàn. Nhà hàng nhỏ V1 điều phối bàn bằng mắt.
- **Chừa chỗ:** cột `reservations.area_id` (gợi ý khu vực, không bắt buộc) để V1.x nối "Nhận bàn → mở phiên" nếu cần.

### D-P5-3 — Đơn online là ẩn danh qua SERVICE ROLE (D15), theo dõi bằng Broadcast (như P3)
Khách online không đăng nhập → tạo đơn + đặt bàn đi qua **Route Handler service role** scope theo `slug` (giống khách QR ở P3, D15). Khách theo dõi trạng thái đơn **realtime qua Supabase Broadcast** channel `order:{id}` (tái dùng cơ chế P3, fallback polling), KHÔNG postgres_changes (RLS chặn anon).
- **Lý do:** nhất quán bảo mật với P3; không mở RLS cho anon.

### D-P5-4 — `source='online'` cho đơn online (phân biệt với `qr`/`staff`)
Thêm giá trị `online` vào `orders.source` (đang `check in ('qr','staff')`). `channel` cho biết mang-về/giao; `source` cho biết nguồn tạo (khách QR tại bàn / nhân viên POS / khách online).
- **Lý do:** báo cáo + lọc hàng đợi rõ ràng; `qr` giữ nghĩa "khách quét QR tại bàn".

### D-P5-5 — Đơn online luôn qua DUYỆT (pending_confirm), bỏ qua cờ `qr_order_auto_send`
Đơn mang về/giao luôn vào `pending_confirm` để nhân viên xác nhận nhận đơn (kiểm tồn/khả năng phục vụ) trước khi xuống bếp — không áp cờ auto-send (cờ đó chỉ cho khách QR tại bàn).
- **Lý do:** đơn online cần con người "nhận đơn"; auto xuống bếp dễ nhận đơn không kịp làm.

## Ảnh hưởng
- **2 migration mới:**
  - `0014_reservations.sql` (05-01): bảng `reservations` + RLS `auth_tenant_ids()` + index + realtime.
  - `0015_online_orders.sql` (05-02): thêm `online` vào `orders.source` check; index `orders(tenant_id, channel, status)`; cột `bills.online_order_id uuid null references orders(id)` + index (dùng ở 05-03).
- **Sửa `lib/orders/create-order.ts`:** tham số hóa `channel` trong `insertOrderGraph` (đang hardcode `dine_in`); thêm `createOnlineOrder`.
- **Sửa KDS:** hiện đơn `confirmed` không có phiên bàn (online) kèm nhãn "Mang về #N / Giao #N".
- **Sửa `lib/billing/bill.ts`:** thêm `openBillForOrder` (bill cho đơn online, session null); `payBill` đặt đơn online sang `completed`.
- **Sửa `lib/billing/reports.ts`:** doanh thu tính cả bill online (`online_order_id` not null), vẫn loại vỏ chia đều (`split_count`).
- **Sửa `lib/auth/rbac.ts`:** thêm `reservations`, `online` vào `ManageSection` (owner/manager).
- **Bật 2 mục nav** "Đặt bàn" + "Đơn online" (đang gắn nhãn "chờ" trong `AdminNav.tsx`).
- **KHÔNG** cột settings mới. **KHÔNG** dependency mới (tái dùng recharts/print/broadcast/vaul đã có).
