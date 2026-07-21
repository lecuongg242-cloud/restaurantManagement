---
phase: 01-nen-tang
plan: 02
type: summary
status: chờ-checkpoint
requirements: [TENANT-01, TENANT-04, AUTH-01]
---

# 01-02 — Super-admin tạo tenant + Owner đăng nhập — BÁO CÁO

Lát cắt dọc "tạo tenant → đăng nhập → admin shell". Toàn bộ code + migration hoàn tất,
`npm run build` xanh, `npm run lint` sạch. Áp DB lên Supabase dev là bước cuối (xem *Việc còn lại*).

## Trạng thái từng cam kết (must_haves)

| Cam kết | Trạng thái | Bằng chứng |
|---|---|---|
| Super-admin tạo nhà hàng (tên + slug) + owner (email + mật khẩu) ở /super | ✅ Code | `app/super/new/page.tsx` + `createTenant` (service role: createUser + insert tenants + membership owner) |
| Owner đăng nhập /r/[slug]/admin/login → vào /admin thấy tên + logo tenant | ✅ Code | `ownerSignIn` (signInWithPassword) + `(protected)/layout.tsx` guard + `AdminShell` header logo/name |
| Owner tenant A mở /r/[slug-B]/admin bị chặn | ✅ Code | `getSessionMembership(slug)` trả null nếu không có membership → layout redirect login |
| Migration 0001 tạo tenants, profiles, memberships, super_admins | ✅ | `supabase/migrations/0001_core_tenant.sql` |
| Migration 0002 bật RLS + `auth_tenant_ids()` | ✅ | `supabase/migrations/0002_rls_baseline.sql` (+ `is_super_admin()`) |
| Form tạo tenant gọi server action dùng service role | ✅ | `app/super/actions.ts` + `lib/supabase/admin.ts` |
| admin/layout kiểm membership theo slug (RLS + guard) | ✅ | `(protected)/layout.tsx` + `lib/auth/session.ts` |

## Kiến trúc & quyết định
- **Route group `(protected)`**: khu admin đã đăng nhập nằm trong `admin/(protected)/` để layout-guard
  KHÔNG bao trang `admin/login` (tránh vòng lặp redirect). Route công khai: `/r/[slug]/admin` vẫn đúng.
- **`memberships.user_id` NULLABLE** (D7): owner/manager/station có `user_id`; nhân viên PIN-only (01-03) `user_id=NULL`.
  Unique một-user-một-tenant chỉ áp khi `user_id is not null`.
- **RLS**: `auth_tenant_ids()` + `is_super_admin()` (SECURITY DEFINER) tránh đệ quy policy. tenants/memberships
  đọc-ghi theo `auth_tenant_ids()`; tenants ghi chỉ super-admin; profiles self; super_admins self-read.
- **Thêm** `/super/login` (ngoài danh sách file gốc) — cần thiết để super-admin xác thực; guard mọi trang /super.

## File đã tạo/đổi
- Migrations: `supabase/migrations/0001_core_tenant.sql`, `0002_rls_baseline.sql`
- Supabase/auth: `lib/supabase/admin.ts`, `lib/auth/session.ts`, `lib/utils.ts` (+`slugify`)
- Super-admin: `app/super/page.tsx`, `app/super/new/page.tsx`, `app/super/login/page.tsx`, `app/super/actions.ts`
- Admin: `app/r/[slug]/admin/login/page.tsx`, `app/r/[slug]/admin/actions.ts`,
  `app/r/[slug]/admin/(protected)/layout.tsx`, `(protected)/page.tsx`,
  `components/admin/AdminShell.tsx`, `components/admin/AdminNav.tsx`
- Middleware: `middleware.ts` (thêm refresh phiên Supabase; giữ x-tenant-slug + subdomain tắt)
- Tenant layout: `app/r/[slug]/layout.tsx` (thin passthrough), `(customer)/page.tsx` (giữ header slug 01-01)

## Verification
- ✅ `npm run build` exit 0 (15 route, Middleware)
- ✅ `npm run lint` — No ESLint warnings or errors
- ✅ Migration 0001+0002 đã áp trên Supabase dev (`supabase db push` Finished)
- ✅ Cách ly tenant chứng minh gián tiếp qua `test:rls` 6/6 PASS (01-04)
- ⏳ Checkpoint human-verify (browser) — bước bấm tay còn lại

## Việc còn lại
Checkpoint browser theo plan §checkpoint:
1. Đăng nhập **super-admin** `super@demo.test / SuperPass123!` → `/super/new` tạo thêm nhà hàng (2 tenant demo đã seed sẵn).
2. Đăng nhập owner `ownerA@pho-viet.test / DemoPass123!` tại `/r/pho-viet/admin/login` → thấy "Phở Việt".
3. Vẫn phiên owner A, mở `/r/bun-bo/admin` → phải bị đẩy về login (chặn chéo tenant).
