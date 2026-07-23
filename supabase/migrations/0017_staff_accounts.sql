-- 0017_staff_accounts.sql — Nhân viên đăng nhập bằng EMAIL + PIN (QD-009).
--
-- Đổi mô hình D7: cashier/waiter/kitchen giờ CÓ tài khoản Supabase riêng (user_id NOT NULL),
-- đăng nhập thẳng ở /pos|/kds/login bằng email + PIN 4 số (mật khẩu Supabase suy dẫn từ PIN
-- bằng pepper server-side). PIN vẫn băm bcrypt ở pin_hash cho PIN-gate (duyệt giảm giá/hủy món),
-- NHƯNG thu hồi quyền đọc cột pin_hash khỏi anon/authenticated để nhân viên quyền thấp — nay đã
-- có phiên RLS — không rút được hash PIN của quản lý.

create extension if not exists citext;

-- ---- Email định danh nhân viên (đồng bộ auth.users.email) --------------------
alter table public.memberships add column if not exists email citext;

create unique index if not exists uniq_memberships_email
  on public.memberships (email) where email is not null;

-- ---- Ẩn cột pin_hash khỏi client-facing roles (RLS lọc HÀNG, không lọc CỘT) --
-- Thu hồi SELECT toàn bảng rồi cấp lại SELECT theo từng cột TRỪ pin_hash. Việc ghi
-- (insert/update/delete) không đổi — vẫn do RLS memberships_tenant_write kiểm soát.
revoke select on public.memberships from anon, authenticated;
grant select (id, tenant_id, user_id, role, display_name, active, created_at, email)
  on public.memberships to anon, authenticated;

-- ---- Chống dò PIN qua endpoint đăng nhập -------------------------------------
-- Khóa tạm theo email sau nhiều lần sai. Chỉ service_role thao tác (bật RLS, không policy
-- → anon/authenticated bị chặn; service_role bỏ qua RLS).
create table if not exists public.staff_login_throttle (
  email        citext primary key,
  fails        int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.staff_login_throttle enable row level security;
