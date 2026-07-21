---
phase: 02-du-lieu-nha-hang
plan: 02
type: summary
status: code hoàn tất — chờ checkpoint human-verify
requirements: [MENU-03]
---

# 02-02 — Nhóm tùy chọn + phụ thu — BÁO CÁO

Nhóm tùy chọn (size/topping/mức đường-đá…) với phụ thu + gắn N-N vào món. Migration 0006 đã áp Supabase dev.

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| Tạo nhóm (name, min/max_select, required) + option (price_delta) | ✅ Code | `modifiers/actions.ts` (createGroup/updateGroup/deleteGroup, addOption/updateOption/deleteOption), `GroupEditor.tsx` |
| Gắn 1+ nhóm vào món (N-N); gỡ được | ✅ Code | `ModifierGroupPicker.tsx` (checkbox trong ItemDialog) + `menu/actions.ts::syncItemGroups` |
| Option bật/tắt "hết" riêng | ✅ Code | `setOptionAvailable` (server) + toggle trong `GroupEditor.tsx` |
| 0006 tạo 3 bảng + RLS | ✅ Đã áp | RLS=true cho modifier_groups, modifier_options, menu_item_modifier_groups |
| Chặn max_select < min_select và required với min=0 | ✅ Code | `validateGroup()` (server) + DB check `max_select >= min_select` |

## Kiến trúc & quyết định
- **Bảng link mang tenant_id trực tiếp** (`menu_item_modifier_groups.tenant_id`) để policy RLS đồng nhất `auth_tenant_ids()` (thay vì EXISTS lồng) — theo gợi ý plan.
- **Gắn N-N = sync-on-save** (thay cho 2 action attach/detach rời): `ModifierGroupPicker` submit `group_ids[]` cùng form ItemDialog; `syncItemGroups` xóa link không còn + thêm link mới, scope tenant. Hidden `group_picker=1` tránh vô tình gỡ hết khi form không kèm picker. Hiệu ứng DB (ghi/xóa dòng link) đúng như attach/detach.
- **price_delta**: integer VND, V1 giữ `>= 0` (DB check). Cascade: xóa món/nhóm tự gỡ link (FK on delete cascade).

## File đã tạo/đổi
- Migration: `supabase/migrations/0006_modifiers.sql`
- Lib: `lib/menu/types.ts` (ModifierGroup, ModifierOption, ModifierGroupWithOptions)
- Trang/action: `app/r/[slug]/admin/(protected)/menu/modifiers/page.tsx`, `modifiers/actions.ts`, `modifiers/GroupEditor.tsx`
- Component: `components/menu/ModifierGroupPicker.tsx`
- Sửa: `app/r/[slug]/admin/(protected)/menu/actions.ts` (syncItemGroups + đọc group_ids trong create/update), `menu/page.tsx` + `ItemDialog.tsx` (nhúng picker), link từ trang Thực đơn sang Nhóm tùy chọn

## Lệch so với plan (ghi lại)
- Plan liệt kê `attachGroup`/`detachGroup` trong `menu/actions.ts`. Triển khai bằng `syncItemGroups` (sync theo danh sách checkbox) — đơn giản hơn, cùng kết quả DB, khớp acceptance "attach/detach ghi/xóa đúng dòng menu_item_modifier_groups (scope tenant)".

## Verification
- ✅ `npx tsc --noEmit` sạch · ✅ `npx next build` exit 0 (route `/admin/menu/modifiers`)
- ✅ Migration 0006 áp Supabase dev; RLS bật cả 3 bảng; DB check max>=min
- ⏳ Checkpoint human-verify (ràng buộc min/max, gắn/gỡ N-N, toggle option hết, RLS A/B) — bước bấm tay còn lại
