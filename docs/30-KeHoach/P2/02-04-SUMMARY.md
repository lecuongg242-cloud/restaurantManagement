---
phase: 02-du-lieu-nha-hang
plan: 04
type: summary
status: code hoàn tất — chờ checkpoint human-verify
requirements: [OPS-06]
---

# 02-04 — Cài đặt (logo + cấu hình tenant) — BÁO CÁO

Trang /admin/settings: tên + logo nhà hàng, %phí phục vụ, %VAT, footer hóa đơn, toggle duyệt order QR. Không cần migration (dùng `tenants.settings` jsonb + `tenants.logo_url` từ 0001).

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| Cập nhật tên + logo; logo hiện ở header admin + khách | ✅ Code | `settings/actions.ts` (updateProfile/uploadLogo), `LogoUpload.tsx`; AdminShell (P1) + `(customer)/page.tsx` render logo_url + name |
| Cấu hình %phí/%VAT/footer/toggle → lưu tenants.settings | ✅ Code | `updateSettings` merge `parseSettings` + clamp, ghi jsonb scope tenant_id |
| Cấu hình scope tenant (RLS); tenant khác không đổi | ✅ Code | update `.eq("id", session.tenant.id)` dưới phiên RLS |
| Shape settings + default + đọc/ghi an toàn | ✅ Code | `lib/tenant/settings.ts` (TenantSettings, DEFAULT_SETTINGS, parseSettings/serializeSettings) |
| Upload logo validate 2 lớp, service role ghi Storage | ✅ Code | `LogoUpload`(client) + `uploadImage`→`validateImage`(server) path `{tenant_id}/logo-{rand}` |

## Kiến trúc & quyết định
- **Settings jsonb an toàn**: `parseSettings` luôn merge default (đủ field kể cả jsonb thiếu) + **clamp %phí/%VAT về [0,100]** (VAT=150 → 100). Thêm `onboarding_done` vào shape (dùng ở 02-05).
- **Logo dùng chung bucket menu-images** (path `{tenant_id}/logo-{rand}`), cùng validate 2 lớp như ảnh món; thay logo → xóa logo cũ.
- **Header khách (ẩn danh)**: RLS chặn đọc `tenants` qua phiên user → đọc CHỈ trường nhận diện công khai (name, logo_url) bằng admin client. Theme sản phẩm cố định (QD-006 F2 — không đổi màu theo tenant).
- **Redirect linh hoạt**: `updateProfile`/`uploadLogo` nhận `redirect_to` (mặc định trang settings) để 02-05 tái dùng, giữ owner trong wizard.
- **AdminShell**: đã render logo_url + name từ P1; thêm `revalidatePath(..., "layout")` khi đổi tên/logo để shell cập nhật ngay (không sửa AdminShell.tsx).

## File đã tạo/đổi
- Lib: `lib/tenant/settings.ts`
- Trang/action: `app/r/[slug]/admin/(protected)/settings/page.tsx`, `settings/actions.ts`
- Component: `components/settings/LogoUpload.tsx`; sửa `app/r/[slug]/(customer)/page.tsx` (logo + tên)
- Nav: `components/admin/AdminNav.tsx` (mục "Cài đặt" thành link thật)

## OPS-06 phần chuyển mốc
- Hiển thị logo ở **đầu hóa đơn/phiếu bếp** thuộc **P3/P4** (khi có route `/print/*` hóa đơn & bếp). P2 đóng phần logo ở header admin + header khách.

## Verification
- ✅ `npx tsc --noEmit` sạch · ✅ `npx next build` exit 0 (route `/admin/settings`)
- ✅ Không cần migration (settings jsonb + logo_url đã có)
- ⏳ Checkpoint human-verify (đổi logo/tên, %VAT=150 bị clamp, RLS A/B) — bước bấm tay còn lại
