---
phase: 02-du-lieu-nha-hang
plan: 01
type: summary
status: code hoàn tất — chờ checkpoint human-verify
requirements: [MENU-01, MENU-02]
---

# 02-01 — CRUD Thực đơn + ảnh + hết món — BÁO CÁO

Lát cắt dọc /admin/menu: danh mục + món (ảnh, giá VND, mô tả, thứ tự) + toggle "hết món". Migration + Storage đã áp Supabase dev.

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| Owner/manager CRUD danh mục + món, sắp xếp được | ✅ Code | `menu/actions.ts` (createCategory/renameCategory/deleteCategory/reorderCategory + createItem/updateItem/deleteItem/reorderItem), `CategoryManager.tsx`, `ItemDialog.tsx` |
| Toggle is_available → đổi ngay, lưu DB | ✅ Code | `setItemAvailable` (server) + `AvailabilityToggle.tsx` (useOptimistic) |
| Ảnh lên bucket menu-images, hiển thị qua next/image; >2MB/sai loại bị chặn (client + server) | ✅ Code | `ImageUpload.tsx` (validate client) + `lib/storage/images.ts::validateImage` (server re-validate trước khi ghi) + `next.config.ts` remotePatterns |
| 0004 tạo menu_categories, menu_items + RLS tenant | ✅ Đã áp | `db push` Finished; RLS=true cả 2 bảng (đã kiểm pg_tables) |
| 0005 tạo bucket public menu-images + policy ghi qua server | ✅ Đã áp | bucket public=true; policy `menu_images_public_read` (SELECT public) + `menu_images_service_write` (service_role) |
| Guard owner/manager qua canManage('menu') | ✅ Code | `menu/page.tsx` + guard trong mọi action (`requireMenuManager`) |

## Kiến trúc & quyết định
- **RBAC**: thêm `canManage(role, section)` vào `lib/auth/rbac.ts` (owner/manager cho menu/tables/settings/onboarding) — tái dùng ở toàn bộ P2.
- **Ảnh 2 lớp**: client (ImageUpload) chặn >2MB/sai mime trước khi gửi; server (`validateImage`) chặn lại trước khi ghi Storage bằng **service role** (admin client). Đường dẫn `{tenant_id}/{item_id}-{rand}.{ext}`. Thay ảnh → xóa ảnh cũ.
- **Giá**: lưu integer VND (`base_price int check >= 0`), input strip ký tự không phải số.
- **Sắp xếp**: nút ↑/↓ hoán đổi `sort_order` với hàng liền kề (chỉ ghi 2 hàng).
- **Món hết**: thẻ mờ (opacity-60) + nhãn "Hết"; toggle optimistic revert khi lỗi.

## File đã tạo/đổi
- Migration: `supabase/migrations/0004_menu_core.sql`, `0005_storage_menu_images.sql`
- Lib: `lib/auth/rbac.ts` (canManage), `lib/menu/types.ts`, `lib/storage/images.ts`, `next.config.ts`
- Trang/action: `app/r/[slug]/admin/(protected)/menu/page.tsx`, `menu/actions.ts`, `menu/CategoryManager.tsx`, `menu/ItemDialog.tsx`
- Component: `components/menu/ImageUpload.tsx`, `components/menu/AvailabilityToggle.tsx`
- Nav: `components/admin/AdminNav.tsx` (mục "Thực đơn" thành link thật)

## Verification
- ✅ `npx tsc --noEmit` sạch · ✅ `npx next build` exit 0 (route `/r/[slug]/admin/menu` build được)
- ✅ Migration 0004 + 0005 áp Supabase dev (`db push` Finished); RLS bật cả 2 bảng; bucket public
- ⏳ Checkpoint human-verify (CRUD, ảnh <2MB vs >2MB, toggle hết, cách ly tenant A/B) — bước bấm tay còn lại
