# BẢN THIẾT KẾ CHI TIẾT — P2: Dữ liệu nhà hàng

> **Trạng thái: ĐÃ DUYỆT** — Chủ dự án "XÁC NHẬN LƯU" ngày 21/07/2026 (sau vòng góp ý v0.2: RPC resolve QR, composite FK, CHECK giá, chặn ảnh tại bucket, wizard 4 bước).
> Phiên bản: 1.0 — 21/07/2026 · Yêu cầu phủ: MENU-01, MENU-02, MENU-03, TABLE-01, TENANT-03
> Phụ thuộc: P1 (ĐÃ DUYỆT — schema lõi, auth, RLS, design system).

## Mục đích
Chủ nhà hàng tự cấu hình được toàn bộ dữ liệu để sẵn sàng phục vụ: danh mục + món (ảnh, giá, tùy chọn), khu vực + bàn với QR in được, và luồng onboarding trọn gói ≤ 15 phút. Khách (chưa đăng nhập) xem được menu mobile-first — nền cho gọi món ở P3.

## 1. Phạm vi

**Làm trong P2:**
- Quản trị menu: danh mục, món, ảnh, giá VND, tùy chọn đơn giản (size/topping), ẩn/hiện, hết món.
- Quản trị khu vực + bàn; sinh QR duy nhất cho từng bàn; xuất file in (PDF/PNG qua trình duyệt).
- Trang menu khách tại `/r/[slug]` và `/r/[slug]/t/[qr_token]` — **chỉ xem** (chưa gọi món).
- Wizard onboarding cho tenant mới.

**KHÔNG làm trong P2** (thuộc phase sau): giỏ hàng/gửi order (P3), sơ đồ bàn POS + trạng thái bàn realtime TABLE-02 (P3), bill/thanh toán (P4), đặt bàn/giao hàng (P5).

## 2. Schema (migration 0002)

Mọi bảng có `tenant_id` + RLS, theo đúng quy tắc P1.

- `menu_categories(id, tenant_id, name, sort, is_active, created_at)`
- `menu_items(id, tenant_id, category_id, name, description, price int /*VND*/ CHECK (price >= 0), image_url, is_active, is_sold_out default false, sort, created_at)` — `is_active` (chủ quán ẩn món) và `is_sold_out` (hết món tạm thời) là 2 cột riêng, KHÔNG gộp thành một cột
- `menu_option_groups(id, tenant_id, item_id, name, selection ∈ {single, multiple}, is_required, sort)` — ví dụ "Size" (single), "Topping" (multiple)
- `menu_options(id, tenant_id, group_id, name, price_delta int CHECK (price_delta >= 0), sort)`
- `areas(id, tenant_id, name, sort, created_at)`
- `tables(id, tenant_id, area_id, name, qr_token unique default gen_random_uuid(), status default 'available', created_at)` — `status` dùng từ P3, P2 chỉ khởi tạo; unique `(tenant_id, area_id, name)`

**Ràng buộc toàn vẹn tại database (defense-in-depth, không chỉ dựa vào app/RLS):**
- Giá không âm: `CHECK (price >= 0)` trên `menu_items`, `CHECK (price_delta >= 0)` trên `menu_options`.
- **Composite FK kèm `tenant_id`** để database tự chặn liên kết dữ liệu chéo tenant (kể cả khi có bug ở app hay code chạy service-role): bảng cha thêm `unique (tenant_id, id)`; bảng con khai FK 2 cột. Áp cho cả 4 quan hệ:
  - `menu_items(tenant_id, category_id)` → `menu_categories(tenant_id, id)`
  - `menu_option_groups(tenant_id, item_id)` → `menu_items(tenant_id, id)`
  - `menu_options(tenant_id, group_id)` → `menu_option_groups(tenant_id, id)`
  - `tables(tenant_id, area_id)` → `areas(tenant_id, id)`

**RLS:**
- Ghi (INSERT/UPDATE/DELETE): chỉ `owner`, `manager` của tenant (qua `has_role()` từ P1), membership `active`.
- Đọc (nhân viên): mọi vai trò active của tenant.
- **Đọc anon (khách — mở mới ở P2, đúng lộ trình P1 đã ghi):** anon SELECT được `menu_categories`/`menu_items` có `is_active = true`, `menu_option_groups`/`menu_options` của món active. Món `is_sold_out` vẫn đọc được (để realtime báo thay đổi) nhưng app khách hiển thị "Hết món"/ẩn theo MENU-02.
- **KHÔNG cấp anon SELECT trực tiếp trên `tables`/`areas`.** Resolve QR qua RPC `resolve_table_by_qr(qr_token)`: `security definer`, `set search_path` cố định, grant execute cho anon; token khớp → trả **đúng một dòng** (tên bàn, tên khu vực, tenant slug), token sai/bàn đã xóa → 0 dòng. Không có đường nào để anon liệt kê/dò danh sách bàn.
- Test RLS mở rộng bộ P1: ma trận cho 6 bảng mới (chéo tenant = 0; anon chỉ đọc dữ liệu active; anon không ghi được gì); test riêng cho RPC (đúng token → 1 dòng, sai token → 0 dòng, anon SELECT trực tiếp `tables`/`areas` → bị từ chối); test composite FK (INSERT liên kết chéo tenant → database từ chối); test CHECK giá âm → từ chối.

## 3. Storage ảnh món

- Bucket `menu-images`, đường dẫn `{tenant_id}/{item_id}.{ext}`.
- Giới hạn ≤ 2MB (theo MENU-01), chỉ jpg/png/webp — chặn ở **3 tầng**: (1) client validate trước khi upload (thông báo tiếng Việt); (2) **cấu hình bucket** `file_size_limit = 2MB` + `allowed_mime_types = [image/jpeg, image/png, image/webp]` — Storage từ chối ở tầng hạ tầng, không phụ thuộc code; (3) Storage policy: `owner`/`manager` của đúng tenant mới được ghi vào path tenant mình; đọc public.
- Hiển thị qua `next/image` (kèm resize/transform của Supabase nếu khả dụng) để đạt MENU-03.

## 4. Quản trị (owner/manager) — `/r/[slug]/admin/*`

- **`/admin/menu`**: danh mục (thêm/sửa/xóa/kéo sắp xếp) + món theo danh mục. Form món: tên, giá (nhập số, hiển thị định dạng VND), mô tả, ảnh (upload + preview), tùy chọn (nhóm + lựa chọn + phụ thu), ẩn/hiện.
- **Nút "Hết món"** ngay trên danh sách (toggle 1 chạm, không cần vào form) → cập nhật `is_sold_out`, app khách phản ánh ≤ 3 giây qua Supabase Realtime (MENU-02).
- **`/admin/tables`**: CRUD khu vực + bàn; mỗi bàn hiện QR thu nhỏ; nút "Tải PNG" từng bàn và **trang in tổng** `/admin/tables/print` — lưới QR (tên khu vực + tên bàn + QR + hướng dẫn quét) khổ A4, in qua trình duyệt/lưu PDF (TABLE-01, cùng triết lý in-qua-trình-duyệt của V1).
- QR encode URL: `https://{domain}/r/[slug]/t/[qr_token]` — sinh bằng thư viện `qrcode` (không gọi dịch vụ ngoài).
- Xóa có ràng buộc: danh mục còn món / khu vực còn bàn → hỏi xác nhận rõ ràng; bàn đã có QR in ra vẫn giữ `qr_token` khi đổi tên (đổi tên không làm QR cũ chết).

## 5. Menu khách (anon, mobile-first) — MENU-03

- `/r/[slug]`: menu đầy đủ — header nhà hàng (logo, tên), thanh danh mục dính (sticky, cuộn ngang), danh sách món (ảnh, tên, mô tả ngắn, giá VND), chi tiết món (sheet/bottom-sheet hiển thị tùy chọn — chưa có nút thêm giỏ).
- `/r/[slug]/t/[qr_token]`: resolve bàn qua RPC `resolve_table_by_qr` (mục 2) → cùng trang menu, hiện badge "Bàn …" (P3 sẽ gắn order vào đây).
- Realtime: subscribe kênh `menu:{tenant_id}` → món chuyển hết món/ẩn biến mất hoặc mờ đi ngay, không cần tải lại trang.
- Hiệu năng ≤ 3 giây trên 4G: server component + cache, ảnh lazy-load ngoài màn hình đầu, font đã subset từ P1; đo bằng Chrome DevTools throttle "Fast 4G" (10 lần, lấy trung vị).
- Layout không vỡ từ 360px; nút/điểm chạm ≥ 44px (chuẩn bị cho ORDER-05).

## 6. Onboarding — TENANT-03

Wizard `/r/[slug]/admin/onboarding`, tự mở khi tenant chưa có dữ liệu (owner đăng nhập lần đầu). **4 bước, khớp 1-1 với câu chữ TENANT-03** ("nhà hàng + 10 món + 5 bàn + in QR"):
1. **Nhà hàng**: xác nhận tên, logo, địa chỉ/SĐT hiển thị trên menu.
2. **Menu nhanh**: tạo danh mục + món ở dạng nhập liệu nhanh (dòng: tên + giá, ảnh bổ sung sau) — mục tiêu 10 món < 5 phút.
3. **Bàn**: tạo khu vực + số lượng bàn hàng loạt (ví dụ "Tầng 1, 8 bàn" → sinh bàn 1–8).
4. **In QR**: mở thẳng trang in tổng; cuối bước hiện checklist tick xanh (≥ 1 danh mục, ≥ 10 món, ≥ 5 bàn, đã mở trang in QR) + link "Xem menu như khách".
- Bỏ qua được từng bước; vào lại từ dashboard admin đến khi checklist đủ.
- Nghiệm thu: đo thật với 1 người không tham gia build, tính giờ từ đăng nhập đến hết bước 4 — ≤ 15 phút.

## 7. Tình huống lỗi phải xử lý

- Upload ảnh > 2MB hoặc sai định dạng → báo tiếng Việt, không upload.
- Quét QR của bàn đã xóa / `qr_token` sai → trang "Mã QR không còn hiệu lực" thân thiện, kèm link về menu nhà hàng.
- Tenant chưa có món nào → menu khách hiện trạng thái trống lịch sự, không lỗi trắng trang.
- Mất mạng khi đang lưu form → toast "Mất kết nối, đang thử lại" (kế thừa P1), không mất dữ liệu đã nhập.
- Hai người cùng sửa một món → lần lưu sau thắng, có toast cảnh báo dữ liệu đã thay đổi (đơn giản, không cần lock).

## 8. Kiểm tra & bằng chứng (đưa vào BaoCao-P2)

- Bộ test RLS mở rộng chạy xanh (P1 43/43 không hỏng + assertions mới: ma trận 6 bảng, anon, RPC resolve QR, composite FK chéo tenant bị từ chối, CHECK giá âm bị từ chối).
- Bằng chứng cấu hình bucket: upload file 3MB / file .gif qua API trực tiếp (bỏ qua client) → Storage từ chối.
- Video: CRUD menu + upload ảnh; toggle hết món trên admin ↔ điện thoại xem menu thấy đổi ≤ 3 giây; tạo khu vực/bàn → in trang QR → quét bằng điện thoại thật ra đúng menu + đúng bàn.
- File in QR thực tế (PDF/ảnh chụp bản in giấy).
- Số đo tải menu trên 4G throttle (10 lần) + ảnh Lighthouse mobile.
- Biên bản đo onboarding ≤ 15 phút với người ngoài (tên, thời gian từng bước).
