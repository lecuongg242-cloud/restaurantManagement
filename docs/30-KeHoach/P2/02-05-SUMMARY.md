---
phase: 02-du-lieu-nha-hang
plan: 05
type: summary
status: code hoàn tất — chờ checkpoint human-verify (cần đo ≤15' với người ngoài team)
requirements: [TENANT-03]
---

# 02-05 — Onboarding wizard (capstone) — BÁO CÁO

Wizard 4 bước gộp P2: Thông tin → Menu mẫu → Bàn + QR → Xong. Seed menu mẫu ~10 món, tạo nhanh bàn + xuất QR, cờ hoàn tất + CTA dashboard.

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| Wizard 4 bước có tiến trình + điều hướng tiến/lùi | ✅ Code | `OnboardingWizard.tsx` (thanh tiến trình ✓, Next/Back, bỏ qua bước) + `steps/Step{Info,Menu,Tables,Done}.tsx` |
| Bước Menu mẫu có nút seed danh mục/món có sẵn | ✅ Code | `StepMenu` → `seedSampleMenu`; `lib/onboarding/sample-menu.ts` (10 món / 3 danh mục) |
| Seed idempotent (không nhân đôi) | ✅ Code | `seedSampleMenu` CHỈ chèn khi tenant chưa có danh mục nào |
| dashboard hiện CTA khi chưa hoàn tất | ✅ Code | `admin/(protected)/page.tsx` hiện Card CTA khi `settings.onboarding_done != true`, ẩn khi xong |
| markOnboardingDone ghi settings.onboarding_done=true | ✅ Code | `markOnboardingDone` merge serializeSettings → về dashboard |
| Người ngoài team hoàn tất ≤15' | ⏳ Chờ đo | Cần checkpoint với người ngoài team (bấm đồng hồ) |

## Kiến trúc & quyết định
- **Tái dùng action P2**: StepInfo → `updateProfile`/`uploadLogo` (02-04, `redirect_to` giữ trong wizard); StepMenu → `seedSampleMenu`; StepTables → `seedTables` (tạo nhanh N bàn B1..BN) + mở /print/qr; StepDone → `markOnboardingDone`.
- **Điều hướng**: state cục bộ cho Next/Back; các nút seed redirect về `?step=N` để giữ đúng bước sau reload. Tiến trình tô ✓ theo trạng thái thực (hasMenu/hasTables/hasLogo/done) từ `getOnboardingState`.
- **Menu mẫu**: 10 món (Món chính 4, Đồ uống 4, Tráng miệng 2), giá integer VND, không kèm ảnh (owner thêm sau).

## File đã tạo/đổi
- Lib: `lib/onboarding/sample-menu.ts`
- Trang/action: `app/r/[slug]/admin/(protected)/onboarding/page.tsx`, `onboarding/actions.ts` (seedSampleMenu, seedTables, markOnboardingDone, getOnboardingState)
- Component: `components/onboarding/OnboardingWizard.tsx` + `steps/StepInfo.tsx`, `StepMenu.tsx`, `StepTables.tsx`, `StepDone.tsx`
- Sửa: `app/r/[slug]/admin/(protected)/page.tsx` (CTA), `settings/actions.ts` (redirect_to), `components/settings/LogoUpload.tsx` (redirectTo prop)

## Verification
- ✅ `npx tsc --noEmit` sạch · ✅ `npx next build` exit 0 (route `/admin/onboarding`)
- ✅ Seed dùng lại schema 0004/0007 (đã áp)
- ⏳ Checkpoint human-verify: super-admin tạo NH mới + owner mới, người NGOÀI team onboard, **đo thời gian ≤15'** (TENANT-03)

## Sau khi cả 5 plan "approved"
- Tick P2 trong `docs/00-TongQuan/Roadmap.md` (đã cập nhật trạng thái "code hoàn tất").
- Cập nhật trạng thái yêu cầu MENU-01/02/03, TABLE-01, OPS-06, TENANT-03 trong `docs/20-DanhSachYeuCau/00-Requirements.md`.
