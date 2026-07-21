# Kế hoạch P3 — Lõi order (giá trị cốt lõi, lát cắt dọc test được trên trình duyệt)

> Lập ngày 22/07/2026. Nguồn: `00-TongQuan/Roadmap.md` (P3), `20-DanhSachYeuCau/00-Requirements.md`,
> `10-BanThietKe/01-KyThuatChiTiet.md` (§3.3–3.4, §6, §7), `03-LuongFrontend.md` (§A, §D, §E), `15-QuyetDinh/QD-005` (D1, D3, D7–D9, D15).
> **Định dạng:** theo GSD PLAN.md như P2 (frontmatter + task XML + acceptance_criteria + must_haves).
> **Tiếp nối P2:** dùng menu (0004/0006), bàn + qr_token (0007), settings (`qr_order_auto_send`), RBAC `canManage`, khung POS/KDS login + PIN từ P1.

## Nguyên tắc chia P3
Giữ ràng buộc như P1/P2: **mỗi plan xây đủ frontend để test thủ công qua luồng**, kết thúc bằng checkpoint `human-verify` (`autonomous: false`). P3 là chuỗi giá trị cốt lõi **khách gọi món → POS duyệt → KDS làm món → in phiếu bếp** nên thứ tự phụ thuộc chặt hơn P2.

| Plan | Tên | Wave | Phụ thuộc | UI test được (bấm vào) | Yêu cầu phủ |
|---|---|---|---|---|---|
| 03-01 | Phiên bàn + gọi món QR (khách) | 1 | P2 | `/r/[slug]/menu?t=…` chọn món+tùy chọn+ghi chú → gửi; `/r/[slug]/order/[id]` theo dõi | TABLE-02 (mở/ghép), ORDER-01, MENU-02 (phần khách) |
| 03-02 | POS duyệt order QR + thêm món thay khách | 2 | 03-01 | `/r/[slug]/pos` sơ đồ bàn ⟳, drawer duyệt/từ chối, panel bàn + thêm món | ORDER-02, ORDER-03 |
| 03-03 | KDS realtime + đo ≤3s | 3 | 03-02 | `/r/[slug]/kds` 3 cột, Bắt đầu/Xong, đo độ trễ | ORDER-04 |
| 03-04 | Hủy món có kiểm soát | 3 | 03-02 | POS panel bàn: hủy món → PIN manager/cashier + lý do | ORDER-05 |
| 03-05 | PrintAdapter + phiếu bếp 58/80mm | 3 | 03-02 | Nút "In phiếu bếp" khi duyệt → `/r/[slug]/print/kitchen/[orderId]` | PRINT-01, PRINT-02, OPS-06 (phiếu bếp) |

Wave 3 (03-03, 03-04, 03-05) độc lập nhau (KDS / hủy món / in — khác bề mặt), làm song song được sau khi 03-02 xong.

## Quyết định P3 (CHỐT 22/07/2026 — ghi lại để xử lý)
1. **Khách theo dõi trạng thái = polling, KHÔNG realtime anon.** Realtime Supabase đi qua RLS — anon không có policy nên không nhận rows (đúng thiết kế D15). Trang `/r/[slug]/order/[id]` poll Route Handler mỗi 4s. Realtime chỉ cho POS/KDS (phiên station có RLS).
2. **Đóng phiên bàn ở P3 = thủ công trên POS** (nút "Đóng phiên" + confirm; bàn về `available`). P4 sẽ tự đóng khi thanh toán xong — phần "đóng phiên khi thanh toán" của TABLE-02 nghiệm thu tại P4, ghi rõ trong SUMMARY 03-02.
3. **"Sửa món đã gửi" = hủy có kiểm soát + thêm dòng mới.** Không edit-in-place món đã xuống bếp (tránh lệch phiếu bếp đã in). ORDER-05 nghiệm thu bằng hủy món (PIN manager/cashier + lý do + log); sửa SL = hủy dòng cũ, thêm dòng mới.
4. **Giỏ khách là state client** (React state + sessionStorage theo `qr_token`), không ghi DB trước khi "Gửi order". Gửi = 1 POST tạo `orders + order_items + order_item_modifiers` nguyên khối.
5. **P3 chỉ `channel=dine_in`.** Takeaway/delivery (C1–C4) để P5 theo Roadmap.
6. **PIN gate**: duyệt/từ chối order + thêm món + đổi trạng thái KDS = chọn nhân viên hiện hành (như P1) để gắn `staff_membership_id`; **hủy món** yêu cầu PIN của membership vai trò **manager/cashier** ngay tại thao tác (D9). Owner/manager đăng nhập email thao tác trên POS thì tự gắn membership của họ.
7. **`served` đánh ở POS** (phục vụ mang món ra); `completed` để P4 (khi đóng bill). KDS chỉ đổi `queued→preparing→ready` (D9).
8. **Đo ≤3s**: cột `confirmed_at` trên orders; KDS hiển thị delta (now − confirmed_at) khi vé xuất hiện lần đầu; đo 10 lần ghi bảng vào SUMMARY 03-03 (ORDER-04).
9. **`qr_order_auto_send`** (02-04): nếu tenant bật → order QR vào thẳng `confirmed` (bỏ duyệt). Mặc định tắt = đúng luồng D8. Xử lý ngay tại Route Handler tạo order.

## Mặc định kỹ thuật P3
- **Khách anon (D15)**: đọc menu = server component dùng service role scope theo `slug` (chỉ dữ liệu công khai: categories/items `active+available`, modifiers, tên+logo tenant). Ghi (tạo order) = Route Handler `POST /r/[slug]/api/order` dùng service role: resolve `qr_token` → table → tenant; validate modifier min/max/required + `is_available` **ở server**; snapshot `name_snapshot`, `unit_price_snapshot`, `price_delta_snapshot`. KHÔNG có policy ghi cho anon.
- **Phiên bàn (D3)**: mở/ghép tại server khi tạo order (không mở lúc xem menu — tránh phiên rác khi khách chỉ xem): tìm `table_sessions status=open` của bàn, không có thì tạo + set bàn `occupied`. 1 phiên mở/bàn (partial unique index).
- **Realtime (§6)**: publication `supabase_realtime` thêm `orders`, `order_items` (trong migration 0008). POS/KDS subscribe `postgres_changes` filter `tenant_id=eq.<id>` bằng browser client phiên station (RLS lọc thêm một lớp). KDS lọc thêm trạng thái ở client.
- **Máy trạng thái (§3.4)**: transition hợp lệ kiểm ở server action (không tin client): `pending_confirm→confirmed|cancelled`, `confirmed→…→served`, item `queued→preparing→ready`, hủy item bất kỳ lúc chưa `served`.
- **RBAC**: POS = station/cashier/waiter/owner/manager (canAccess 'pos' từ P1); KDS = station/kitchen/owner/manager. Hành động ghi kiểm role ở server action.
- **In (D1, §7)**: `lib/print/adapter.ts` interface `PrintAdapter` + `BrowserPrintAdapter` (mở route in, `window.print()`). Ghi log `print_jobs` khi bấm in (type `kitchen_ticket`, status `printed`). BridgePrintAdapter chừa interface, KHÔNG implement.

## Migration P3 (tiếp nối 0001–0007, mỗi migration thuộc plan sở hữu)
- `0008_orders_core.sql` (03-01) — `table_sessions` (partial unique open/bàn), `orders` (+`confirmed_at`, `confirmed_by`, `created_by` = membership id nullable), `order_items` (+`cancel_reason`, `cancelled_by`), `order_item_modifiers` + RLS tenant + index (`orders(tenant_id,status)`, `order_items(tenant_id,order_id)`, `order_items(tenant_id,status)`) + thêm 2 bảng vào publication `supabase_realtime`.
- `0009_print_jobs.sql` (03-05) — `print_jobs` + RLS tenant.
- 03-02/03-03/03-04: KHÔNG migration mới (dùng cột đã khai ở 0008).

## Nghiệm thu P3 (khớp Roadmap)
1. Khách quét QR → gọi món ≤6 chạm, 360px không vỡ, món hết không đặt được (03-01, ORDER-01 + MENU-02).
2. Order QR `pending_confirm` → POS duyệt → xuống KDS; POS thêm món thay khách vào thẳng KDS (03-02, ORDER-02/03).
3. KDS nhận item ≤3s sau confirmed (đo 10 lần), đổi làm/xong mức món (03-03, ORDER-04).
4. Hủy món cần PIN manager/cashier + lý do, có log (03-04, ORDER-05).
5. Phiếu bếp in đúng khổ 58/80mm qua PDF preview, có logo+tên tenant (03-05, PRINT-01/02).

## Stack thêm cho P3
- Không thêm dependency mới (realtime đã có trong `@supabase/supabase-js`; PIN bcryptjs từ P1; in = CSS `@media print`).

## Cách chạy manual test (chung)
- Khách: mở `http://localhost:3000/r/pho-viet/menu?t=<qr_token>` (lấy token từ /admin/tables hoặc quét QR đã in ở P2) — giả lập mobile 360px bằng DevTools.
- POS/KDS: đăng nhập station (`station@pho-viet.test / StationPass123!`) hoặc owner (`ownerA@pho-viet.test / DemoPass123!`); test realtime cần **2 cửa sổ** (POS + KDS) đặt cạnh nhau.
- In: xem PDF preview của `window.print()` (chưa cần phần cứng — theo rủi ro đã ghi ở Roadmap).
