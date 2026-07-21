---
phase: 01-nen-tang
plan: 03
type: summary
status: đạt
requirements: [AUTH-02, AUTH-03, AUTH-04, OPS-06]
---

# 01-03 — Trạm POS/KDS + PIN + RBAC — BÁO CÁO

Lát cắt dọc "tạo nhân viên → đăng nhập trạm → chọn tên + PIN → vào POS/KDS". Code + migration hoàn tất,
build xanh, lint sạch. Áp DB là bước cuối chung với 01-02/01-04.

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| Owner/manager tạo nhân viên (cashier/waiter/kitchen) + PIN 4 số ở /admin/staff | ✅ Code | `staff/page.tsx` + `staff/actions.ts` (`createStaff` → `hashPin` → insert user_id=NULL) |
| Thiết bị đăng nhập trạm 1 lần; chọn tên + PIN → shell POS, thao tác gắn staff | ✅ Code | `pos/login` (`stationSignIn`) → `StationScreen` → `StaffPicker`+`PinPad` → `verifyStaffPin` (cookie staff) |
| Điều hướng theo vai trò; vai trò sai bị chặn | ✅ Code | `lib/auth/rbac.ts` (`defaultRouteForRole`/`canAccess`) dùng ở login redirect + admin guard |
| Migration 0003: role station + cột pin_hash + index | ✅ | `supabase/migrations/0003_station_pin.sql` (index `(tenant_id, role)`) |
| `lib/auth/pin.ts` băm/so khớp bcrypt phía server | ✅ | `bcryptjs` + `import "server-only"` |
| `PinPad` bàn phím số, target ≥44px | ✅ | nút số 64×64px (`h-16 w-16`) |
| PIN xác thực ở server action, KHÔNG so khớp client | ✅ | `verifyStaffPin` (server) — client chỉ thu chữ số rồi gửi |

## Kiến trúc & quyết định
- **D7 đúng chuẩn**: `station` = tài khoản Supabase dùng chung thiết bị (cửa RLS); cashier/waiter/kitchen =
  membership `user_id=NULL` + `pin_hash` (PIN-only). PIN phân định người + gate, KHÔNG thay RLS.
- **Cookie phiên nhân viên**: `staff_pos` / `staff_kds` (httpOnly, path theo bề mặt, 12h) lưu membershipId
  sau khi PIN đúng. `StationScreen` đọc cookie → hiện shell với tên nhân viên hoặc StaffPicker.
- **RBAC redirect**: xử lý ở server (login actions + guard layout), không nhồi truy vấn DB vào middleware
  (middleware chỉ refresh phiên + gắn slug). Acceptance "admin/layout dùng canAccess" ⇒ `(protected)/layout.tsx`.
- **StaffPicker** lọc theo bề mặt: POS hiện cashier/waiter; KDS hiện kitchen.

## File đã tạo/đổi
- Migration: `supabase/migrations/0003_station_pin.sql`
- Auth: `lib/auth/pin.ts`, `lib/auth/rbac.ts`
- Admin staff: `app/r/[slug]/admin/(protected)/staff/page.tsx`, `staff/actions.ts`
- Trạm: `app/r/[slug]/station-actions.ts`, `pos/page.tsx`, `pos/login/page.tsx`, `kds/page.tsx`, `kds/login/page.tsx`
- Components: `components/staff/PinPad.tsx`, `StaffPicker.tsx`, `StationScreen.tsx`, `StationLoginForm.tsx`

## Verification
- ✅ `npm run build` exit 0 · ✅ `npm run lint` sạch
- ✅ PIN không lưu thô (hash bcrypt trước insert) — DB xác nhận Lan/Hùng/Mai là `[PIN]` (user_id NULL)
- ✅ Migration 0003 đã áp; seed tạo sẵn station + Lan(1234)/Hùng(5678)/Mai(4321)
- ⏳ Checkpoint human-verify (browser) — bước bấm tay còn lại

## Việc còn lại (checkpoint browser)
1. Owner `ownerA@pho-viet.test / DemoPass123!` → `/r/pho-viet/admin/staff` (Lan/Hùng đã seed; thêm mới nếu muốn).
2. `/r/pho-viet/pos/login` đăng nhập trạm `station@pho-viet.test / StationPass123!` → chọn "Lan" → PIN `1234` → vào POS thấy "Nhân viên: Lan"; PIN sai → báo lỗi.
3. `/r/pho-viet/kds/login` tương tự → chọn "Hùng" → PIN `5678`.
4. Kiểm nút PIN ≥44px (thực tế 64px).
