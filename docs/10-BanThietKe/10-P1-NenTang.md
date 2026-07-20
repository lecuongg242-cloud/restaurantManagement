# BẢN THIẾT KẾ CHI TIẾT — P1: Nền tảng

> **Trạng thái: BẢN NHÁP** — chờ Chủ dự án "XÁC NHẬN LƯU" trước khi build.
> Phiên bản: 0.1 — 20/07/2026 · Yêu cầu phủ: TENANT-01, TENANT-02, AUTH-01..04, OPS-01, OPS-02

## Mục đích
Dựng khung dự án chạy trên 3 môi trường, với đăng nhập/phân quyền và cách ly dữ liệu tenant được chứng minh bằng test — nền móng cho mọi giai đoạn sau.

## 1. Cấu trúc dự án

```
restaurant-system/
├── app/
│   ├── (super)/super/...        ← Super-admin: quản lý tenant
│   ├── (admin)/r/[slug]/admin/  ← Chủ/quản lý nhà hàng
│   ├── (staff)/r/[slug]/pos/    ← POS (P3)
│   ├── (staff)/r/[slug]/kds/    ← KDS (P3)
│   ├── (customer)/r/[slug]/     ← App khách: menu, QR (P2-P3)
│   └── style-guide/             ← Trang design system (nội bộ)
├── components/ui/               ← shadcn/ui + component dự án
├── lib/supabase/                ← client server/browser, helpers RLS
├── supabase/
│   ├── migrations/              ← SQL migration (Supabase CLI)
│   └── tests/                   ← test RLS (pgTAP hoặc script TS)
└── docs/                        ← tài liệu (đã có)
```

## 2. Schema lõi (migration 0001)

- `tenants(id, slug unique, name, logo_url, status, created_at)`
- `profiles(id = auth.users.id, full_name, phone)`
- `memberships(tenant_id, user_id, role, status)` — role ∈ {owner, manager, cashier, waiter, kitchen}; 1 user có thể thuộc nhiều tenant
- `super_admins(user_id)` — danh sách chủ SaaS
- Hàm SQL `current_tenant_ids()` + `has_role(tenant_id, roles[])` dùng trong mọi policy

**RLS bắt buộc bật trên mọi bảng**:
- SELECT/INSERT/UPDATE/DELETE chỉ khi `tenant_id ∈ current_tenant_ids()` và vai trò đủ quyền
- `tenants`: chỉ super-admin tạo; owner chỉ đọc/sửa tenant của mình
- Anon (khách chưa đăng nhập): chưa có quyền gì ở P1 (mở dần ở P2–P3 qua view/policy riêng)

## 3. Auth & phân quyền

- Supabase Auth email + mật khẩu; phiên qua cookie (`@supabase/ssr`)
- Middleware Next.js: resolve `slug` → tenant, gắn vào context; chặn route theo vai trò:
  - `/super/*` → super_admin
  - `/r/[slug]/admin/*` → owner, manager
  - `/r/[slug]/pos/*` → cashier, waiter, manager, owner
  - `/r/[slug]/kds/*` → kitchen, manager, owner
- Owner mời nhân viên: tạo membership + gửi magic-link; khóa = `memberships.status = 'disabled'` (middleware + RLS cùng chặn)
- Màn hình: đăng nhập, chọn tenant (nếu thuộc nhiều), danh sách nhân viên (mời/khóa), trang tạo tenant của super-admin

## 4. Ba môi trường & pipeline (OPS-01)

| | local | dev | prod |
|---|---|---|---|
| Git | working copy | branch `dev` | branch `main` |
| Web | `next dev` | Vercel (env Preview/dev domain) | Vercel Production |
| DB | Supabase CLI local (Docker) | Supabase project **dev** | Supabase project **prod** |
| Migration | `supabase db reset` | CI: `supabase db push` khi merge vào `dev` | CI: `supabase db push` khi merge vào `main` |

- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only) — đặt trong Vercel env theo môi trường + `.env.local`; có `.env.example` không chứa giá trị thật (OPS-02)
- GitHub Actions: lint + typecheck + test RLS trên mọi PR; migration tự chạy theo branch

## 5. Design system (nền cho toàn bộ UI)

- Chạy skill `ui-ux-pro-max` sinh design system cho "restaurant POS/ordering SaaS, Vietnamese market" → chốt style, palette, font (hỗ trợ tiếng Việt tốt — ví dụ Be Vietnam Pro/Inter), token
- Ba lớp token (primitive → semantic → component) bằng CSS variables, theo skill `design-system`; dark mode cho KDS (bếp thường tối)
- shadcn/ui làm nền component; trang `/style-guide` render: màu, chữ, nút, form, bảng, trạng thái — dùng làm chuẩn đối chiếu các phase sau

## 6. Tình huống lỗi phải xử lý

- Đăng nhập sai ≥ 5 lần → khóa tạm 5 phút (thông báo tiếng Việt rõ ràng)
- Vào `/r/slug-khong-ton-tai` → trang 404 thân thiện
- User không có membership với tenant → chuyển về trang chọn tenant, không lộ dữ liệu
- Mất mạng khi đang thao tác → toast "Mất kết nối, đang thử lại"

## 7. Kiểm tra & bằng chứng

- Test RLS tự động: với 2 tenant + 6 user mẫu, chạy ma trận truy vấn chéo → 0 truy cập trái phép
- Video/ảnh: đăng nhập từng vai trò thấy đúng màn hình; tạo tenant từ super-admin
- Log CI xanh trên cả `dev` và `main`
