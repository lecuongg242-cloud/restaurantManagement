# BẢN THIẾT KẾ KỸ THUẬT CHI TIẾT — Hệ thống nhà hàng SaaS (V1)

> Phiên bản: 1.0 — 21/07/2026. Nguồn: `00-TongThe.md` (ĐÃ DUYỆT) + `15-QuyetDinh/QD-005-KienTrucKyThuat.md` (ĐÃ CHỐT).
> Tài liệu này là nguồn sự thật cho tầng kỹ thuật: kiến trúc, định tuyến, mô hình dữ liệu, RLS, auth, realtime, in ấn, máy trạng thái order/bill.

---

## 1. Kiến trúc tổng thể

```
┌───────────────────────── Next.js (App Router) trên Vercel ─────────────────────────┐
│  Route groups                                                                        │
│  (customer)  /r/[slug]/...      → khách QR, đặt bàn, đặt món  (anon, mobile-first)   │
│  (staff)     /r/[slug]/pos|kds  → POS + KDS   (đăng nhập trạm + PIN)                 │
│  (admin)     /r/[slug]/admin    → owner/manager  (Supabase Auth email)              │
│  (super)     /super             → super-admin (tạo tenant)                           │
│                                                                                      │
│  Route Handlers (server, service role)  → API cho khách anon (D15)                  │
│  Middleware  → nhận diện tenant từ slug (chừa subdomain), gắn tenant_id vào request  │
└──────────────────────────────────────────────────────────────────────────────────────┘
        │ Supabase JS (RLS)                         │ service role (server only)
        ▼                                           ▼
┌───────────────────────────── Supabase ─────────────────────────────┐
│  Postgres (schema multi-tenant, RLS theo tenant_id)                 │
│  Auth (owner/manager + tài khoản "trạm" cho POS/KDS)               │
│  Realtime (postgres_changes lọc theo tenant_id + trạm)             │
│  Storage (ảnh món, ≤ 2MB)                                          │
└────────────────────────────────────────────────────────────────────┘
```

**Nguyên tắc phân tách client:**
- **Staff/admin** → client Supabase trình duyệt, mọi truy vấn qua **RLS** (an toàn theo phiên đăng nhập).
- **Khách QR/online (anon)** → **không** chạm Supabase trực tiếp khi ghi. Đi qua **Route Handler** dùng service role, tự scope tenant theo `slug`/`qr_token` rồi mới ghi (D15).

---

## 2. Định tuyến & nhận diện tenant (D2)

- URL công khai: `/r/[slug]` (vd `/r/pho-viet/menu?table=abc123`).
- `middleware.ts`: đọc `slug` (V1) → tra `tenants` → gắn `x-tenant-id`, `x-tenant-slug` vào request headers cho layout/route dùng. **Chừa sẵn**: nếu request tới subdomain `*.domain.com` thì lấy tenant theo `tenants.subdomain` — code nhánh này viết sẵn nhưng tắt ở V1.
- QR bàn mã hóa: `/r/[slug]/menu?t=[qr_token]`. `qr_token` là chuỗi ngẫu nhiên/bàn (không đoán được), map tới `tables.id`.

---

## 3. Mô hình dữ liệu (Postgres)

> Quy ước: mọi bảng nghiệp vụ có `tenant_id uuid not null`, `created_at`, `updated_at`. Khóa chính `uuid` (gen_random_uuid). Tiền lưu `integer` (VND, không phần lẻ). Enum dùng Postgres `enum` hoặc `text + check`.

### 3.1 Tenant & người dùng
```
tenants(id, slug unique, name, subdomain nullable unique, settings jsonb, status, created_at)
  settings gồm: { currency:'VND', service_charge_pct, vat_pct, allow_discount,
                  qr_order_auto_send:false, receipt_footer, ... }

profiles(id = auth.users.id, full_name, phone, created_at)     -- owner/manager & tài khoản trạm

memberships(id, tenant_id, user_id, role, display_name, pin_hash nullable, active, created_at)
  role ∈ {owner, manager, cashier, waiter, kitchen, station}
  pin_hash: bcrypt của PIN 4 số (cho cashier/waiter/kitchen thao tác trên thiết bị trạm)
```
- **owner/manager**: `user_id` là tài khoản Supabase riêng (email+mật khẩu).
- **station**: 1 tài khoản dùng chung/nhà hàng, đăng nhập cố định trên thiết bị POS/KDS. Là "cửa" RLS.
- **cashier/waiter/kitchen**: có thể không cần tài khoản Supabase riêng — phân định qua PIN trên thiết bị trạm (D7). PIN dùng để (a) ghi `staff_id` vào order/payment, (b) gate thao tác nhạy cảm (hủy món, đóng bill).

### 3.2 Menu (D4)
```
menu_categories(id, tenant_id, name, sort_order, active)
menu_items(id, tenant_id, category_id, name, description, base_price,
           image_url, is_available, sort_order, active)          -- is_available = nút "hết món" (86)
modifier_groups(id, tenant_id, name, min_select, max_select, required)
modifier_options(id, tenant_id, group_id, name, price_delta, is_available, sort_order)
menu_item_modifier_groups(item_id, group_id)                      -- N–N
```

### 3.3 Khu vực, bàn, phiên bàn (D3)
```
areas(id, tenant_id, name, sort_order)
tables(id, tenant_id, area_id, name, seats, qr_token unique, status)
  status ∈ {available, occupied, reserved, cleaning}
table_sessions(id, tenant_id, table_id, status, opened_at, closed_at, opened_by)
  status ∈ {open, closed}                                        -- 1 phiên mở/bàn tại 1 thời điểm
```

### 3.4 Order & máy trạng thái (D8, D9)
```
orders(id, tenant_id, table_session_id nullable, channel, source, status,
       customer_contact jsonb nullable, note, created_by, confirmed_by, created_at)
  channel ∈ {dine_in, takeaway, delivery}
  source  ∈ {qr, staff}
  status  ∈ {pending_confirm, confirmed, preparing, ready, served, completed, cancelled}
  customer_contact: {name, phone, address?} — cho takeaway/delivery (D11)

order_items(id, tenant_id, order_id, menu_item_id, name_snapshot, unit_price_snapshot,
            qty, note, status, cancel_reason nullable, prepared_at nullable)
  status ∈ {queued, preparing, ready, served, cancelled}

order_item_modifiers(id, order_item_id, option_id, name_snapshot, price_delta_snapshot)
```

**Máy trạng thái order (mức đơn):**
```
QR:    pending_confirm --(nhân viên duyệt)--> confirmed --> preparing --> ready --> served --> completed
Staff: confirmed (bỏ qua duyệt) --> preparing --> ...
bất kỳ --(manager/cashier + lý do)--> cancelled
```
- Chỉ khi `confirmed`: item xuất hiện trên **KDS** và tạo **phiếu bếp** (print_job).
- KDS đổi trạng thái ở **mức order_item** (`queued→preparing→ready`); order lên `ready` khi mọi item `ready`.

### 3.5 Bill, tách/gộp, thanh toán (D5, D6)
```
bills(id, tenant_id, table_session_id nullable, status, subtotal,
      discount_type, discount_value, service_charge_pct, vat_pct,
      service_charge_amount, vat_amount, total, note, created_by, paid_at)
  status ∈ {open, paid, void}
  discount_type ∈ {none, amount, percent}

bill_items(id, bill_id, order_item_id, qty_allocated, amount)     -- phân bổ để TÁCH bill
payments(id, tenant_id, bill_id, method, amount, staff_id, received_at)
  method ∈ {cash, transfer}
```
- **Gộp bàn**: một `bill` có thể gom `order_items` từ nhiều `table_session` (tham chiếu qua `bill_items`).
- **Tách bill**: một `order_item` có `qty` = N có thể được chia sang nhiều `bill` qua nhiều dòng `bill_items` (tổng `qty_allocated` ≤ `qty`). Chia đều "N người" = tạo N bill và phân bổ tự động.
- **Công thức tổng** (snapshot lên bill khi chốt):
  `subtotal = Σ bill_items.amount`
  `discount = amount | subtotal*percent/100 | 0`
  `service_charge_amount = (subtotal-discount)*service_charge_pct/100`
  `vat_amount = (subtotal-discount+service_charge_amount)*vat_pct/100`
  `total = subtotal - discount + service_charge_amount + vat_amount`

### 3.6 Đặt bàn & kênh online (D10, D11)
```
reservations(id, tenant_id, area_id nullable, table_id nullable, customer_name, phone,
             party_size, reserved_at, status, note, decided_by, created_at)
  status ∈ {pending, confirmed, rejected, seated, no_show, cancelled}
```
- Đơn takeaway/delivery **tái dùng `orders`** với `channel≠dine_in` + `customer_contact`. Vòng đời trạng thái đi qua `orders.status` (D11) — không bảng riêng.

### 3.7 In ấn — hàng đợi tương lai (D1)
```
print_jobs(id, tenant_id, type, target_station, payload jsonb, status, created_at, printed_at)
  type ∈ {receipt, kitchen_ticket}
  status ∈ {pending, printed, failed}
```
- **V1**: `print_jobs` là log/để dựng nội dung; việc in thật do trình duyệt (`window.print`) thực hiện qua route in. Cầu in cục bộ (V1.x) sẽ *poll* bảng này để in tự động — không đổi nghiệp vụ.

---

## 4. RLS — Row Level Security

**Helper (SECURITY DEFINER):**
```sql
create function auth_tenant_ids() returns setof uuid
  language sql stable security definer as $$
    select tenant_id from memberships where user_id = auth.uid() and active
  $$;
```
**Mẫu policy cho mọi bảng nghiệp vụ:**
```sql
alter table <t> enable row level security;
create policy tenant_read  on <t> for select using (tenant_id in (select auth_tenant_ids()));
create policy tenant_write on <t> for all
  using (tenant_id in (select auth_tenant_ids()))
  with check (tenant_id in (select auth_tenant_ids()));
```
- **Phân quyền vai trò (RBAC)** tinh hơn (vd chỉ manager sửa menu, chỉ cashier đóng bill): kiểm ở **tầng app** (Route Handler/Server Action đọc `role` từ membership) — RLS lo cách ly tenant, app lo vai trò. PIN gate thao tác nhạy cảm (D7, D9).
- **super-admin**: bảng `tenants` có policy riêng (chỉ role super, xác định qua bảng `super_admins(user_id)`).
- **Khách anon**: KHÔNG có policy cho anon ghi. Mọi ghi của khách đi qua Route Handler service role đã scope tenant (D15). Đọc menu công khai: hoặc policy `select` cho anon lọc theo `tenants.status='active'` **và** chỉ các cột an toàn, hoặc (khuyến nghị) qua Route Handler đọc.
- **Tiêu chí nghiệm thu P1**: bộ test tự động chứng minh user tenant A không đọc/ghi được dữ liệu tenant B (SQL/integration test).

---

## 5. Auth & phiên làm việc (D7)

| Chủ thể | Cách đăng nhập | Ranh giới dữ liệu |
|---|---|---|
| Super-admin | Supabase email/mật khẩu, có trong `super_admins` | Toàn cục (chỉ bảng tenant/quản trị) |
| Owner / Manager | Supabase email/mật khẩu, `memberships.role` | RLS theo tenant của họ |
| Thiết bị POS/KDS | Đăng nhập **1 lần** bằng tài khoản "station" của nhà hàng | RLS theo tenant của trạm |
| Cashier/Waiter/Kitchen | Chọn tên trên thiết bị trạm + **PIN 4 số** (bcrypt) | Không tự mở phiên DB; thao tác gắn `staff_id`, PIN gate thao tác nhạy cảm |

- PIN xác thực tại Route Handler (so bcrypt), trả về token thao tác ngắn hạn lưu trong bộ nhớ tab. **PIN không thay RLS** — chỉ phân định người + kiểm soát nghiệp vụ.

---

## 6. Realtime

- Kênh Supabase `postgres_changes` trên `order_items` và `orders`, **lọc `filter: tenant_id=eq.<id>`** tại nguồn.
- **KDS** subscribe item chuyển sang `confirmed/queued/preparing/ready`.
- **POS** subscribe thay đổi trạng thái order/table_session + order QR mới (`pending_confirm`) để duyệt.
- Mục tiêu độ trễ ≤ 3s (tiêu chí #2). Đo bằng timestamp round-trip.

---

## 7. In ấn (D1) — PrintAdapter

```ts
interface PrintAdapter {
  printReceipt(bill: BillView): Promise<void>
  printKitchenTicket(ticket: KitchenTicketView): Promise<void>
}
```
- **V1 — BrowserPrintAdapter**: mở route in dành riêng (`/print/receipt/[billId]`, `/print/kitchen/[orderId]`) với CSS `@media print` khổ 58/80mm (font monospace, không tràn khổ), gọi `window.print()`. Thu ngân bấm in hóa đơn; nhân viên bấm in phiếu bếp khi duyệt order.
- **V1.x — BridgePrintAdapter** (chừa sẵn): ghi `print_jobs`, cầu in cục bộ ESC/POS poll và in tự động ≤ 5s. Bật bằng cấu hình tenant, không sửa UI/nghiệp vụ.
- **Nội dung phiếu bếp**: bàn, giờ, danh sách món + số lượng + tùy chọn + ghi chú.
- **Nội dung hóa đơn**: tên nhà hàng, bàn, danh sách món + đơn giá + thành tiền, các dòng giảm giá/phí phục vụ/VAT, tổng, footer.

---

## 8. Frontend & responsive

- **App khách** `(customer)`: mobile-first từ 360px, nút ≥ 44px, gọi món ≤ 6 chạm (tiêu chí #7). Design system theo **QD-004 (PostHog)** + shadcn/ui, tiếng Việt.
- **POS** `(staff)`: tối ưu tablet — sơ đồ bàn, giỏ order, tách/gộp bill, thanh toán, in.
- **KDS** `(staff)`: tối ưu màn hình lớn — cột theo trạng thái, cỡ chữ lớn, cập nhật realtime.
- **Admin** `(admin)`: menu/bàn/QR/nhân viên/đặt bàn/đơn online/báo cáo.

---

## 9. Môi trường & pipeline

- `local` → branch `dev` (Vercel preview + Supabase dev) → branch `main` (Vercel prod + Supabase prod).
- Migration bằng **Supabase CLI** (`supabase/migrations/*.sql`), chạy theo pipeline khi merge.
- Secrets qua Vercel env + `.env.local` (không commit). Service role key chỉ server-side.
- Seed demo: script tạo 2 tenant demo (tiêu chí #6).

---

## 10. Bản đồ yêu cầu → thiết kế

Xem `20-DanhSachYeuCau/00-Requirements.md` cho danh sách yêu cầu đo được và `00-TongQuan/Roadmap.md` cho lộ trình giai đoạn tham chiếu tài liệu này.
