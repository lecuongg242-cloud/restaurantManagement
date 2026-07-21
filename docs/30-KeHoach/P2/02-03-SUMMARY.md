---
phase: 02-du-lieu-nha-hang
plan: 03
type: summary
status: code hoàn tất — chờ checkpoint human-verify
requirements: [TABLE-01]
---

# 02-03 — Khu vực/bàn + QR — BÁO CÁO

Khai báo khu vực + bàn (qr_token unique tự sinh) và xuất QR: trang in gộp A4 + tải PNG/SVG từng bàn. Migration 0007 đã áp.

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| CRUD khu vực + bàn (tên, số ghế); qr_token unique tự sinh | ✅ Code + DB | `tables/actions.ts`, `AreaTableManager.tsx`; DB default `encode(gen_random_bytes(9),'hex')` unique |
| /print/qr in gộp A4 (window.print) mọi bàn; tải PNG/SVG từng bàn | ✅ Code | `print/qr/page.tsx` (CSS @media print A4) + `PrintButton.tsx` + `QrDownload.tsx` |
| QR mã hoá URL tuyệt đối /r/[slug]/menu?t=[qr_token] (host từ request) | ✅ Code | `lib/tables/qr.ts::menuUrlForToken` (host + x-forwarded-proto từ `headers()`) |
| 0007 tạo areas, tables + RLS | ✅ Đã áp | RLS=true cả 2 bảng; status check 4 giá trị; seats check >=1 |

## Kiến trúc & quyết định
- **QR**: thư viện `qrcode` — SVG (`toString type svg`, in nét, nhúng inline dangerouslySetInnerHTML) + PNG data URL (`toDataURL`, để tải). URL tuyệt đối dựng từ `host` header (đúng local/dev/prod, không cần env domain); localhost tự dùng http.
- **qr_token**: sinh ở DB (default), app KHÔNG truyền khi insert → không đoán được, unique.
- **Khu vực xóa an toàn**: `tables.area_id` FK `on delete set null` → xóa khu vực, bàn chuyển sang nhóm "Chưa xếp khu" (không mất bàn).
- **In A4**: `.no-print` ẩn chrome/nút; `@page size:A4`; lưới 3 cột QR, `break-inside-avoid`.
- **Xuất QR**: nút ở /admin/tables mở /print/qr (`target=_blank`). Trang /print/qr guard membership owner/manager/station (ngoài route group (protected) nên tự guard).

## File đã tạo/đổi
- Migration: `supabase/migrations/0007_areas_tables.sql`
- Lib: `lib/tables/qr.ts`, `lib/tables/types.ts`, `package.json` (qrcode + @types/qrcode)
- Trang/action: `app/r/[slug]/admin/(protected)/tables/page.tsx`, `tables/actions.ts`, `tables/AreaTableManager.tsx`, `app/r/[slug]/print/qr/page.tsx`
- Component: `components/tables/PrintButton.tsx`, `components/tables/QrDownload.tsx`
- Nav: `components/admin/AdminNav.tsx` (mục "Bàn & QR" thành link thật)

## Verification
- ✅ `npx tsc --noEmit` sạch · ✅ `npx next build` exit 0 (routes `/admin/tables`, `/print/qr`)
- ✅ Migration 0007 áp Supabase dev; RLS bật; qr_token unique + default ngẫu nhiên
- ⏳ Checkpoint human-verify (tạo bàn, in A4, quét QR ra URL đúng, RLS A/B) — bước bấm tay còn lại
