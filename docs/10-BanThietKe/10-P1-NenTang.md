# BẢN THIẾT KẾ CHI TIẾT — P1: Nền tảng

> **Trạng thái: ĐÃ DUYỆT** — Chủ dự án "XÁC NHẬN LƯU" ngày 20/07/2026 (sau 4 điểm cập nhật).
> Phiên bản: 1.0 — 20/07/2026 · Yêu cầu phủ: TENANT-01, TENANT-02, AUTH-01..04, OPS-01, OPS-02

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
- `memberships(tenant_id, user_id, role, status)` — role ∈ {owner, manager, cashier, waiter, kitchen}; status ∈ {active, disabled}; 1 user có thể thuộc nhiều tenant
- `tenant_invitations(id, tenant_id, email, role, token unique, status, expires_at, invited_by, created_at)` — status ∈ {pending, accepted, expired, revoked}; lời mời hết hạn sau 7 ngày
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
- **Luồng mời nhân viên (qua `tenant_invitations`, KHÔNG tạo membership trực tiếp)**:
  1. Owner/manager nhập email + vai trò → tạo bản ghi `tenant_invitations` (pending) + gửi link chứa token
  2. Người được mời mở link → đăng ký hoặc đăng nhập bằng đúng email được mời
  3. Hệ thống xác thực token còn hạn + đúng email → **khi đó mới tạo `memberships`** (active) và chuyển invitation sang accepted
  4. Lời mời hết hạn/đã thu hồi → trang báo lỗi rõ ràng, không tạo membership; owner thu hồi được lời mời pending
- **Khóa nhân viên**: đặt `memberships.status = 'disabled'` → có hiệu lực **ngay từ request tiếp theo** trên cả 2 tầng:
  - *Middleware*: mỗi request kiểm membership của tenant đang truy cập; disabled → chặn route, đẩy về trang đăng nhập kèm thông báo
  - *RLS*: mọi policy đều điều kiện `status = 'active'` → kể cả gọi API trực tiếp (bỏ qua UI) cũng không đọc/ghi được dữ liệu tenant đó
  - Chỉ chặn đúng tenant bị khóa; membership active ở tenant khác của cùng user không bị ảnh hưởng
- Màn hình: đăng nhập, chọn tenant (nếu thuộc nhiều), danh sách nhân viên (mời/thu hồi lời mời/khóa), trang chấp nhận lời mời, trang tạo tenant của super-admin

## 4. Ba môi trường & pipeline (OPS-01)

| | local | dev | prod |
|---|---|---|---|
| Git | working copy | branch `dev` | branch `main` |
| Web | `next dev` | Vercel (env Preview/dev domain) | Vercel Production |
| DB | Supabase CLI local (Docker) | Supabase project **dev** | Supabase project **prod** |
| Migration | `supabase db reset` | CI: `supabase db push` khi merge vào `dev` | CI: `supabase db push` khi merge vào `main` |

- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only) — đặt trong Vercel env theo môi trường + `.env.local`; có `.env.example` không chứa giá trị thật (OPS-02)
- GitHub Actions: lint + typecheck + test RLS trên mọi PR; migration tự chạy theo branch

**Quy định bất di bất dịch về database:**
- **KHÔNG sửa database production thủ công** (SQL editor, dashboard, script ad-hoc). Mọi thay đổi schema/dữ liệu hệ thống đi qua migration → PR → pipeline. Trường hợp khẩn cấp phải lập Quyết định (QD-00X) ghi rõ lý do + lệnh đã chạy, và bổ sung migration tương ứng ngay sau đó.
- **KHÔNG tắt/bỏ qua RLS** dưới mọi hình thức: không `disable row level security`, không tạo policy `USING (true)` cho bảng nghiệp vụ, không dùng service-role key để lách RLS trong luồng nghiệp vụ. Service-role chỉ dùng cho tác vụ hệ thống server-side có kiểm soát (migration, seed, job) và phải ghi chú rõ tại chỗ dùng.

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

- Test RLS tự động: với 2 tenant + bộ user mẫu, chạy ma trận truy vấn chéo → 0 truy cập trái phép
- Ma trận phân quyền **6 tài khoản**: super-admin + 5 vai trò tenant (owner, manager, cashier, waiter, kitchen) × 4 khu vực (super/admin/pos/kds) — đúng 100%
- Test luồng mời: lời mời pending → chấp nhận → có membership; lời mời hết hạn/thu hồi → không tạo membership
- Test khóa: user đang đăng nhập bị khóa → request kế tiếp bị chặn ở cả middleware (route) lẫn RLS (API trực tiếp)
- Video/ảnh: đăng nhập từng vai trò thấy đúng màn hình; tạo tenant từ super-admin; luồng mời nhân viên đầy đủ
- Log CI xanh trên cả `dev` và `main`
