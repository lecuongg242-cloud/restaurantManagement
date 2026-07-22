# Kế hoạch P5 — Kênh online (đặt bàn + đặt món mang về/giao)

> Lập ngày 22/07/2026. Nguồn: `00-TongQuan/Roadmap.md` (P5), `20-DanhSachYeuCau/00-Requirements.md`
> (RESV-01, RESV-02, ONLINE-01), `10-BanThietKe/01-KyThuatChiTiet.md` (§3.3 orders/channel/customer_contact),
> `15-QuyetDinh/QD-008` (5 quyết định P5).
> **Định dạng:** theo GSD PLAN.md như P3/P4 (frontmatter + task XML + acceptance_criteria + must_haves).
> **Tiếp nối P2–P4:** dùng menu khách (`getCustomerMenu`, `customer-menu.ts`), giỏ + cart client (P3), `create-order.ts`
> (`insertOrderGraph`, `nextKitchenNo`), Broadcast `order:{id}` (P3), KDS realtime (03-03), luồng bill P4
> (`bills/bill_items/payments`, `computeBillTotals`, `payBill`, `printReceipt`), dashboard `reports.ts` (04-05),
> `PaymentDialog` + `ReceiptDoc` (04-04), RBAC `canManage`/`canAccess`.

## Nguyên tắc chia P5
Giữ ràng buộc P1–P4: **mỗi plan xây đủ frontend để test thủ công qua luồng**, kết thúc bằng checkpoint
`human-verify` (`autonomous: false`). P5 mở **2 kênh khách online** độc lập nhau:
- **Đặt bàn** (RESV-01/02) — bảng mới `reservations`, không đụng order/bill → làm trước, độc lập.
- **Đặt món mang về/giao** (ONLINE-01) — tái dùng order + bill P4, chia 2 lát: (a) tạo đơn + duyệt + bếp + theo dõi
  khách; (b) vòng đời tới `completed` + thu tiền (bill mỗi đơn) + hóa đơn + doanh thu.

| Plan | Tên | Wave | Phụ thuộc | UI test được (bấm vào) | Yêu cầu phủ |
|---|---|---|---|---|---|
| 05-01 | Đặt bàn online + duyệt + danh sách theo ngày | 1 | P2 (khu vực) | `/r/[slug]/reserve` gửi đặt bàn → `/r/[slug]/admin/reservations` duyệt | RESV-01, RESV-02 |
| 05-02 | Đặt món online: tạo đơn + duyệt + bếp + theo dõi | 2 | P3 (menu/order/KDS/broadcast) | `/r/[slug]/online` đặt món → `/admin/online` nhận đơn → KDS | ONLINE-01 (tạo/duyệt/bếp) |
| 05-03 | Vòng đời tới hoàn tất + thu tiền + hóa đơn + doanh thu | 3 | 05-02, P4 (bill) | `/admin/online` sẵn sàng → thu tiền → hoàn tất; `/admin/reports` | ONLINE-01 (hoàn tất/tiền) |

05-01 độc lập hoàn toàn (bảng riêng) → làm song song với 05-02 được. 05-03 cần đơn online từ 05-02 + luồng bill P4.

## Quyết định P5 (CHỐT 22/07/2026 — chi tiết ở QD-008)
1. **Đơn online tái dùng luồng bill P4**: `openBillForOrder` (1 đơn = 1 bill, `table_session_id=null`, `online_order_id`), thu mặt/CK, in hóa đơn, **vào doanh thu**. Không tách/gộp/chia đều, không phí giao/tài xế.
2. **Đặt bàn chỉ danh sách + duyệt**: `pending → confirmed|rejected`; xếp bàn thủ công (không mở phiên tự động). Cột `area_id` gợi ý khu vực (không giữ bàn).
3. **Khách online ẩn danh qua service role (D15)** + theo dõi bằng **Broadcast `order:{id}`** (như P3).
4. **`source='online'`** (thêm vào enum) phân biệt với `qr`/`staff`.
5. **Đơn online luôn qua duyệt** (`pending_confirm`), bỏ qua cờ `qr_order_auto_send`.

## Mô hình dữ liệu

### reservations (migration 0014, thuộc 05-01)
```
reservations(id uuid pk, tenant_id fk tenants cascade,
      customer_name text not null, customer_phone text not null,
      party_size int not null check (party_size >= 1),
      reserved_at timestamptz not null,          -- ngày giờ khách muốn (UTC; hiển thị giờ VN)
      note text,
      status text check ('pending','confirmed','rejected','cancelled') default 'pending',
      area_id uuid null references areas on delete set null,  -- gợi ý khu vực, KHÔNG giữ bàn (D-P5-2)
      decided_by uuid null,                       -- membership duyệt
      decided_at timestamptz null, reject_reason text,
      created_at, updated_at)
```
- RLS `auth_tenant_ids()` (admin đọc/ghi); khách gửi qua **service role** scope theo slug (không policy anon — D15).
- Index: `reservations(tenant_id, reserved_at)` (list theo ngày), `reservations(tenant_id, status)`.
- Realtime: `alter publication supabase_realtime add table public.reservations` (2 quản lý thấy đơn mới pop).

### orders / bills (migration 0015, thuộc 05-02 — dùng cột đã khai ở 0008/0012)
- `orders.source`: thêm `online` vào check (`'qr','staff','online'`).
- `orders.channel`: dùng `takeaway` / `delivery` (đã có từ 0008); `table_session_id=null` cho đơn online.
- `orders.customer_contact`: `{name, phone, address?}` (address bắt buộc khi `delivery`).
- `bills.online_order_id uuid null references orders(id) on delete set null` — liên kết bill ↔ đơn online (dùng ở 05-03).
- Index: `orders(tenant_id, channel, status)` (hàng đợi online), `bills(tenant_id, online_order_id)`.

## Vòng đời đơn online (ONLINE-01)
```
 (khách đặt)                (nhân viên)         (KDS bếp)          (nhân viên giao/nhận + thu tiền)
 pending_confirm ──duyệt──▶ confirmed ──làm──▶ preparing/ready ──sẵn sàng──▶ completed
       │  (+kitchen_no khi confirmed)                                            ▲
       └──từ chối──▶ cancelled                                    payBill(openBillForOrder) đặt completed
```
- **pending_confirm → confirmed**: nhân viên "Nhận đơn" (gán `kitchen_no`, `confirmed_at/by`) → xuống KDS.
- **confirmed → preparing → ready**: KDS đổi trạng thái mức món (như dine-in); đơn `ready` khi mọi món `ready`.
- **ready → completed**: nhân viên "Giao/Trả khách" → mở bill đơn (`openBillForOrder`) → thu tiền (`payBill`) → đơn `completed`, món `served`, hóa đơn in được.
- **Hủy**: từ chối lúc `pending_confirm` (lý do) hoặc hủy trước khi giao.
- Khách theo dõi qua `/r/[slug]/order/[id]` (tái dùng trang P3) + Broadcast: "Chờ xác nhận → Đang chuẩn bị → Sẵn sàng → Hoàn tất / Đã hủy".

## Mặc định kỹ thuật P5
- **Tạo đơn online** (`createOnlineOrder` trong `create-order.ts`): validate + snapshot bằng `validateAndBuildLines` (dùng lại); `insertOrderGraph` tham số hóa `channel` (bỏ hardcode `dine_in`); `table_session_id=null`; `source='online'`; `status='pending_confirm'` (D-P5-5). `customer_contact` bắt buộc `name`+`phone`; `address` bắt buộc khi `delivery`.
- **KDS đơn online**: KDS query thêm order `confirmed` có `table_session_id=null` (channel≠dine_in); thẻ hiện nhãn kênh ("Mang về" cam / "Giao" xanh) + `#kitchen_no` thay số bàn. Món ẩn khi `served`/`cancelled` (như dine-in).
- **Bill đơn online** (`openBillForOrder`): gom `order_items` (≠cancelled) của 1 đơn → `bill(table_session_id=null, online_order_id=orderId)` + `bill_items` trọn `qty`; `computeBillTotals` với `service_charge_pct/vat_pct` từ settings. Không tách/gộp. `payBill` (dùng lại 04-04) đặt bill `paid` + đơn `completed` + món `served`.
- **Doanh thu** (`reports.ts`): đếm mọi `bills` `paid` loại vỏ chia đều (`split_count IS NULL`) — bill online tự vào (session null nhưng `online_order_id` not null). Kiểm điều kiện lọc không vô tình bỏ bill online.
- **RBAC**: đặt bàn + đơn online quản lý ở khu **admin** (owner/manager, `canAccess('admin')`); thêm `reservations`/`online` vào `ManageSection`. Thu tiền đơn online nằm trong `/admin/online` (owner/manager V1; cashier POS nối ở V1.x nếu cần).
- **Realtime admin**: `/admin/reservations` + `/admin/online` nghe `postgres_changes` (bảng `reservations` / `orders`) + `setAuth` (như POS P3) để đơn mới pop không reload.
- **Theo dõi khách**: tái dùng Broadcast `order:{id}` P3; server phát event khi đổi status (dùng lại hàm broadcast của 03-01/03-02).

## Migration P5 (tiếp nối 0001–0013)
- `0014_reservations.sql` (05-01) — `reservations` + RLS + 2 index + publication.
- `0015_online_orders.sql` (05-02) — alter `orders.source` check thêm `online`; index `orders(tenant_id,channel,status)`; `bills.online_order_id` + index. (05-03 KHÔNG migration mới.)

## Nghiệm thu P5 (khớp Roadmap)
1. Khách gửi đặt bàn (ngày giờ, số người, SĐT) → `pending`; quản lý xác nhận/từ chối; danh sách theo ngày đúng (05-01, RESV-01/02).
2. Khách đặt món mang về/giao (tên/SĐT, +địa chỉ nếu giao) → đơn `pending_confirm`; nhân viên nhận đơn → xuống KDS (nhãn kênh + #số); khách theo dõi realtime (05-02, ONLINE-01 phần đầu).
3. Đơn online chạy hết vòng đời tới `completed`; thu tiền (mặt/CK) → hóa đơn 80mm; **doanh thu dashboard tính cả đơn online** (05-03, ONLINE-01 phần cuối).
4. Cách ly tenant: owner tenant khác không thấy reservation/đơn online của tenant này (mọi plan).

## Stack thêm cho P5
- **Không thêm dependency.** Tái dùng: recharts (dashboard), Broadcast (theo dõi), vaul/motion (bề mặt khách như P3), `@media print` (hóa đơn 04-04).

## Cách chạy manual test (chung)
- Khách đặt bàn: `/r/pho-viet/reserve` (không cần đăng nhập).
- Khách đặt món online: `/r/pho-viet/online` (không cần đăng nhập) → theo dõi `/r/pho-viet/order/<id>`.
- Nhân viên: đăng nhập owner (`ownerA@pho-viet.test / DemoPass123!`) → `/r/pho-viet/admin/reservations` + `/r/pho-viet/admin/online`.
- Bếp: `/r/pho-viet/kds` (station/kitchen) — thấy đơn online đã nhận.
- Doanh thu: `/r/pho-viet/admin/reports` — đối chiếu có đơn online.
- Cách ly: owner Bún Bò không thấy dữ liệu Phở Việt.
