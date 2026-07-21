---
phase: 01-nen-tang
plan: 04
type: summary
status: chờ-checkpoint
requirements: [TENANT-02]
---

# 01-04 — Chứng minh cách ly tenant (RLS) + 2 tenant demo — BÁO CÁO

Tiêu chí nghiệm thu quan trọng nhất của P1. Bộ test RLS + trang data-scope + seed 2 tenant + CI hoàn tất.
Chạy `npm run test:rls` để đóng cam kết (cần áp DB + seed trước).

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| `npm run test:rls` PASS: A không đọc/ghi được dữ liệu B | ✅ **PASS 6/6** | `Test Files 1 passed · Tests 6 passed` (DB thật, phiên anon) |
| Trang /admin/data-scope chỉ liệt kê dữ liệu tenant hiện tại | ✅ Code | `(protected)/data-scope/page.tsx` dùng phiên RLS (không service role) |
| 2 tenant demo (Phở Việt, Bún Bò) qua seed | ✅ Code | `supabase/seed.sql` + `scripts/seed.mjs` (Admin API, idempotent) |
| test chứa ca A đọc B, A ghi B đều bị chặn | ✅ | ca "A đọc B → 0 rows", "A ghi B → bị chặn", "A sửa B → 0 rows", chiều ngược B⊥A |
| CI chạy test:rls mỗi push | ✅ | `.github/workflows/ci.yml` (build + test:rls, env qua secrets) |
| test dùng anon + phiên đăng nhập, KHÔNG service role | ✅ | `tests/rls/setup.ts` `signInAs` dùng ANON key |

## Kiến trúc & quyết định
- **Test RLS thật**: đăng nhập từng owner bằng ANON key (như client thật) rồi thử đọc/ghi chéo. Lấy `tenantB`
  qua chính phiên owner B (không service role) để tránh phụ thuộc id cứng.
- **Seed 2 nguồn**: `supabase/seed.sql` (declarative, cho local/CI `db reset`) + `scripts/seed.mjs`
  (Admin API — đáng tin trên project remote không có psql/Docker). Cùng credentials demo.
- **Credentials demo**: `ownerA@pho-viet.test` / `ownerB@bun-bo.test` (mật khẩu `DemoPass123!`),
  station `station@<slug>.test` / `StationPass123!`.

## File đã tạo/đổi
- Seed: `supabase/seed.sql`, `scripts/seed.mjs`
- Test: `vitest.config.ts`, `tests/rls/setup.ts`, `tests/rls/tenant-isolation.test.ts`
- UI: `app/r/[slug]/admin/(protected)/data-scope/page.tsx`
- CI: `.github/workflows/ci.yml`
- Tiện ích reset dev (một lần): `scripts/db-reset.mjs` (+ script `npm run db:reset`)

## Verification
- ✅ `npm run build` exit 0 · ✅ `npm run lint` sạch
- ✅ **`npm run test:rls` → 6/6 PASS** trên Supabase dev thật (phiên anon, không service role)
- ✅ Migration 0001–0003 đã áp (`supabase db push` finished) · ✅ seed: 2 tenant + super-admin + station + PIN staff
- ⏳ Checkpoint human-verify (2 trình duyệt, owner A vs B) — bước bấm tay còn lại

## Đã chạy (bằng chứng)
```
supabase migration repair --status reverted 0001   → history sạch
supabase db push                                    → applied 0001,0002,0003 · Finished
npm run seed                                         → Super-admin + Phở Việt + Bún Bò
npm run test:rls                                     → Test Files 1 passed | Tests 6 passed
```
Dữ liệu seed: tenants=2, memberships=7 (2 owner + 2 station [acct], Lan/Hùng/Mai [PIN]), super_admins=1.
