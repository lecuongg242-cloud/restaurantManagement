# Kế hoạch P2 — Dữ liệu nhà hàng (lát cắt dọc, mỗi plan test được trên trình duyệt)

> Lập ngày 21/07/2026. Nguồn: `00-TongQuan/Roadmap.md` (P2), `20-DanhSachYeuCau/00-Requirements.md`, `10-BanThietKe/01,02,03`, `15-QuyetDinh/QD-005, QD-006`.
> **Định dạng:** theo GSD PLAN.md (frontmatter + task XML + acceptance_criteria + must_haves). Đặt trong `docs/` để giữ 1 nguồn sự thật.
> **Tiếp nối P1:** dùng nguyên khung 01-01..01-04 (Next.js 15 + Supabase RLS + AdminShell + design system Mistral). Kích hoạt các mục sidebar admin đã chừa sẵn (Thực đơn, Bàn & QR, Cài đặt).

## Nguyên tắc chia P2
Giữ đúng ràng buộc của chủ dự án như P1: **mỗi plan phải xây đủ frontend để test thủ công qua luồng**, kết thúc bằng **checkpoint kiểm thử thủ công** (`autonomous: false`). P2 làm việc chủ yếu ở **khu admin** (owner/manager cấu hình dữ liệu). **App khách (menu gọi món) hoãn sang P3** — P2 không xây bề mặt khách (quyết định 21/07/2026, xem *Quyết định P2* §1).

| Plan | Tên | Wave | Phụ thuộc | UI test được (bấm vào) | Yêu cầu phủ |
|---|---|---|---|---|---|
| 02-01 | CRUD Thực đơn + ảnh + hết món | 1 | P1 | `/r/[slug]/admin/menu` tạo danh mục/món, upload ảnh, bật "hết món" | MENU-01, MENU-02 |
| 02-02 | Nhóm tùy chọn + phụ thu | 2 | 02-01 | `/admin/menu` quản lý modifier group/option, gắn vào món | MENU-03 |
| 02-03 | Khu vực/bàn + QR | 1 | P1 | `/admin/tables` tạo khu vực/bàn; `/print/qr` in gộp + tải PNG/SVG | TABLE-01 |
| 02-04 | Cài đặt (logo + cấu hình tenant) | 1 | P1 | `/admin/settings` upload logo, %phí/%VAT/footer, toggle duyệt-QR | OPS-06 |
| 02-05 | Onboarding wizard (capstone) | 3 | 02-01, 02-03, 02-04 | `/admin/onboarding` wizard 4 bước + seed menu mẫu; đo ≤15' | TENANT-03 |

Wave 1 (02-01, 02-03, 02-04) độc lập nhau (menu / bàn / settings — khác bảng), làm song song được. Wave 2 (02-02) cần menu. Wave 3 (02-05) là capstone gom info+menu+bàn.

## Quyết định P2 (CHỐT 21/07/2026 — ghi lại để xử lý)
1. **App khách hoãn P3.** P2 không xây `/r/[slug]/menu` cho khách. `MENU-02` ("khách không đặt được món hết") nghiệm thu ở P2 **gián tiếp**: toggle `is_available` ở admin + kiểm DB; phần "khách thấy Hết" nghiệm thu đầy đủ ở P3 khi có màn gọi món.
2. **Thêm 02-04 Cài đặt cho OPS-06.** Bảng yêu cầu gắn OPS-06 (logo tenant) vào P2 nhưng danh sách plan gốc (02-01..04) thiếu màn Cài đặt → **bổ sung plan 02-04 Cài đặt**, gom OPS-06 (logo+tên) + cấu hình dùng cho bill P4 (`service_charge_pct`, `vat_pct`, `receipt_footer`) + toggle `qr_order_auto_send`. Onboarding dời thành **02-05** (capstone). Roadmap P2 đã cập nhật theo.
3. **Xuất QR = cả hai**: trang in gộp A4 (`/print/qr`, `window.print`, nhất quán D1 PrintAdapter) **và** tải PNG/SVG từng bàn.
4. **Onboarding = wizard 4 bước + menu mẫu**: thông tin NH → menu mẫu (nút seed vài danh mục/món để sửa) → bàn + xuất QR → xong.

## Mặc định kỹ thuật P2
- **Ảnh menu (Storage)**: bucket Supabase Storage `menu-images`, **public read** (ảnh vốn hiển thị cho khách). Đường dẫn `{tenant_id}/{item_id}-{rand}.{ext}`. **Validate ≤2MB + đúng loại ảnh ở CẢ client (trước upload) và server (Route Handler/action)**. Ghi `menu_items.image_url` = public URL. Ghi/xóa ảnh chỉ qua server (service role); read public. Logo tenant dùng cùng cơ chế (path `{tenant_id}/logo-*`).
- **QR**: mã hoá **URL tuyệt đối** `https://{host}/r/{slug}/menu?t={qr_token}` — lấy `host` từ header request lúc render trang in (không cần env domain, chạy đúng local/dev/prod). `qr_token` là chuỗi ngẫu nhiên không đoán được (khác `table.id`), unique. Sinh QR bằng thư viện `qrcode` (SVG cho in nét, PNG cho tải).
- **RBAC**: quản lý menu/bàn/settings/onboarding = **owner/manager** (mở rộng `lib/auth/rbac.ts`, tái dùng guard `(protected)` như P1). Nhân viên PIN không vào.
- **Snapshot**: chưa cần ở P2 (snapshot giá/tên áp dụng khi tạo order/bill ở P3/P4 — QD-005 §2).

## Migration P2 (tiếp nối 0001–0003, mỗi migration thuộc plan sở hữu)
- `0004_menu_core.sql` (02-01) — `menu_categories`, `menu_items` + RLS tenant + index.
- `0005_storage_menu_images.sql` (02-01) — bucket `menu-images` (public read) + policy `storage.objects` (ghi/xóa chỉ service role; logo tenant dùng chung bucket).
- `0006_modifiers.sql` (02-02) — `modifier_groups`, `modifier_options`, `menu_item_modifier_groups` (N-N) + RLS.
- `0007_areas_tables.sql` (02-03) — `areas`, `tables` (qr_token unique) + RLS + index. (`table_sessions` để P3.)
- 02-04 Cài đặt: KHÔNG cần migration — dùng `tenants.settings` (jsonb) + `tenants.logo_url` đã có từ 0001.

## Nghiệm thu P2 (khớp Roadmap)
1. Tạo danh mục/món/tùy chọn, bật "hết món" (02-01, 02-02).
2. Tạo khu vực/bàn + xuất QR (in được + tải được) (02-03).
3. Logo+tên tenant hiện ở admin/khách shell; cấu hình %phí/%VAT/footer lưu được (02-04, OPS-06).
4. Người ngoài team onboard (tạo NH + 10 món + 5 bàn + in QR) trong ≤15' (02-05, TENANT-03).

## Stack thêm cho P2
- `qrcode` (sinh QR SVG/PNG). Supabase Storage (đã có trong `@supabase/supabase-js`). `next/image` để hiển thị ảnh (cấu hình `remotePatterns` cho host Supabase Storage).
- Không thêm xử lý ảnh phía server (không `sharp`) — validate kích thước/loại, lưu nguyên bản.

## Cách chạy manual test (chung)
Mỗi plan kết thúc bằng task `checkpoint:human-verify` mô tả URL + thao tác. Đăng nhập owner demo (`ownerA@pho-viet.test / DemoPass123!`) từ P1 để test khu admin. Không có phần cứng in ở P2 (in QR qua `window.print` + PDF preview; in hóa đơn/bếp ở P3/P4).
