# BẢN THIẾT KẾ TỔNG QUÁT — Hệ thống nhà hàng SaaS

> **Trạng thái: ĐÃ DUYỆT** — Chủ dự án "XÁC NHẬN LƯU" ngày 20/07/2026.
> Phiên bản: 1.0 — 20/07/2026

## 1. Người dùng và nhu cầu

| Người dùng | Cần gì |
|---|---|
| Chủ / quản lý nhà hàng | Cài đặt nhà hàng, menu, bàn, nhân viên; xem doanh thu tức thời |
| Phục vụ / thu ngân | Nhận order, gộp/tách bill, thanh toán nhanh |
| Bếp | Thấy món cần làm theo thứ tự, báo "đang làm / xong" |
| Thực khách | Quét QR gọi món tại bàn; đặt bàn online; đặt món mang về/giao |

## 2. Các phân hệ chính (V1)

```
┌─────────────────────────────────────────────────────┐
│  App khách (không cần đăng nhập) — MOBILE-FIRST      │
│  • Thiết kế ưu tiên điện thoại (khách chỉ dùng phone)│
│  • Quét QR bàn → xem menu → gọi món → theo dõi món   │
│  • Trang đặt bàn online  • Trang đặt món mang về/giao│
├─────────────────────────────────────────────────────┤
│  App nhân viên (đăng nhập, phân quyền theo vai trò)  │
│  • POS: sơ đồ bàn, order, bill, thanh toán, IN HÓA ĐƠN│
│  • KDS: hàng đợi món cho bếp (realtime) + IN PHIẾU BẾP│
├─────────────────────────────────────────────────────┤
│  App quản trị (chủ nhà hàng)                         │
│  • Menu & giá, khu vực/bàn + QR, nhân viên & vai trò │
│  • Xác nhận đặt bàn/đơn giao  • Báo cáo doanh thu    │
├─────────────────────────────────────────────────────┤
│  Super-admin (chủ SaaS — chính bạn)                  │
│  • Tạo/quản lý tenant, gói dịch vụ                   │
└─────────────────────────────────────────────────────┘
```

## 3. Luồng sử dụng chính

**Luồng 1 — Gọi món tại bàn (QR):**
Khách quét QR bằng điện thoại → menu của đúng nhà hàng + bàn → chọn món, ghi chú → gửi order → món hiện trên KDS bếp (≤ 3s) **và phiếu bếp tự động in tại trạm bếp** → bếp bấm "xong" → phục vụ mang món → thu ngân đóng bill tại POS.

**Luồng 2 — POS nhân viên:**
Phục vụ mở sơ đồ bàn → chọn bàn → thêm món (thay khách) → bill gộp mọi order của bàn → thanh toán (tiền mặt/chuyển khoản) → **in hóa đơn cho khách (máy in nhiệt 58/80mm)** → bàn về trạng thái trống.

**Luồng 3 — Đặt bàn online:**
Khách vào trang đặt bàn → chọn ngày giờ, số người → nhận xác nhận (quản lý duyệt hoặc auto) → nhắc lịch; quản lý thấy danh sách đặt bàn theo ngày.

**Luồng 4 — Đặt món mang về / giao:**
Khách chọn món trên trang online → để lại SĐT + địa chỉ (nếu giao) → đơn vào hàng đợi quản lý xác nhận → bếp làm → giao/khách đến lấy → đánh dấu hoàn tất.

**Luồng 5 — Quản trị & báo cáo:**
Chủ nhà hàng đăng nhập → dashboard doanh thu ngày/tuần/tháng, món bán chạy → quản lý menu (ẩn/hiện, hết món), bàn, nhân viên.

## 4. Kiến trúc kỹ thuật

- **Frontend + API**: Next.js App Router (1 monorepo), deploy Vercel.
  - Route groups: `(customer)` / `(staff)` / `(admin)` / `(super)`.
  - Tenant nhận diện qua subdomain hoặc slug (`/r/[slug]/...`) — chốt ở bản thiết kế chi tiết.
- **Supabase**: Postgres (schema multi-tenant, RLS theo `tenant_id`), Auth (nhân viên/chủ), Realtime (order → KDS/POS), Storage (ảnh món).
- **Realtime**: Supabase Realtime channels theo `tenant_id` + trạm (POS/KDS).
- **In ấn (V1)**: in qua trình duyệt với layout khổ máy in nhiệt 58/80mm:
  - *Hóa đơn khách*: thu ngân bấm in tại POS (thiết bị POS nối máy in nhiệt).
  - *Phiếu bếp*: tự động in tại trạm bếp khi order mới đến (mỗi trạm là 1 thiết bị nối máy in); nội dung: bàn, giờ, món + số lượng + ghi chú.
  - Nếu in tự động qua trình duyệt bị hạn chế → phương án dự phòng (ESC/POS qua app in cục bộ) sẽ quyết ở bản thiết kế chi tiết.
- **Responsive**: app khách thiết kế mobile-first (điện thoại là mặc định); POS tối ưu tablet; KDS tối ưu màn hình lớn.
- **Môi trường**: `local` → branch `dev` (Vercel dev + Supabase dev) → branch `main` (Vercel prod + Supabase prod). Migration bằng Supabase CLI, chạy theo pipeline.

## 5. Phác thảo dữ liệu chính

`tenants`, `users` + `memberships` (vai trò: owner, manager, cashier, waiter, kitchen), `menu_categories`, `menu_items`, `areas`, `tables` (+ mã QR), `orders`, `order_items` (trạng thái: pending → confirmed → preparing → ready → served / cancelled), `bills`, `payments`, `reservations`, `delivery_orders`. Tất cả bảng nghiệp vụ đều có `tenant_id` + RLS.

## 6. Giới hạn và quy tắc (V1)

- Thanh toán: chỉ ghi nhận tiền mặt / chuyển khoản (hiện QR ngân hàng tĩnh nếu có) — chưa tích hợp cổng thanh toán.
- Web responsive/PWA — không app native.
- Không quản lý kho nguyên liệu (chỉ nút "hết món").
- Không tích hợp bên giao hàng thứ ba.
- Menu 1 ngôn ngữ (tiếng Việt); tiền tệ VND.
- Mỗi order tối đa 50 món; ảnh món ≤ 2MB.
- In ấn: hỗ trợ máy in nhiệt 58/80mm qua trình duyệt; không hỗ trợ in LAN/Bluetooth trực tiếp từ server trong V1.

## 7. Tiêu chí hoàn thành V1 (đo được)

1. Onboard tenant mới (tạo nhà hàng, 10 món, 5 bàn, in QR) trong ≤ 15 phút.
2. Order từ điện thoại khách xuất hiện trên KDS trong ≤ 3 giây (đo 10 lần liên tiếp).
3. Thu ngân đóng bill và hiển thị hóa đơn trong ≤ 5 giây.
4. Doanh thu ngày trên dashboard khớp 100% tổng bill đã đóng (đối chiếu 20 bill test).
5. RLS test: user tenant A không đọc/ghi được bất kỳ dữ liệu nào của tenant B (bộ test tự động).
6. Chạy trên prod Vercel với 2 tenant demo, 3 loại thiết bị (điện thoại khách, tablet POS, màn hình bếp).
7. App khách dùng mượt trên điện thoại 360px: không vỡ layout, thao tác gọi món hoàn tất ≤ 6 chạm, nút bấm ≥ 44px.
8. In hóa đơn khổ 80mm ra đủ: tên nhà hàng, bàn, danh sách món + giá, tổng tiền — chữ rõ, không tràn khổ (test in thật).
9. Phiếu bếp tự in trong ≤ 5 giây kể từ khi khách gửi order (test 10 lần liên tiếp).

## 8. Lộ trình đề xuất (chi tiết hóa sau khi duyệt)

| Giai đoạn | Nội dung |
|---|---|
| P1 | Nền tảng: auth, tenant, RLS, khung UI, design system |
| P2 | Menu + bàn/QR + quản trị cơ bản |
| P3 | Gọi món QR (mobile-first) + POS + KDS (realtime) + in phiếu bếp — lõi giá trị |
| P4 | Bill + thanh toán + in hóa đơn + báo cáo doanh thu |
| P5 | Đặt bàn online + đặt món mang về/giao |
| P6 | Hoàn thiện: onboarding, PWA, kiểm thử E2E, phát hành V1 |
