-- 0002_rls_baseline.sql — RLS nền (P1 / plan 01-02, §4).
-- Helper auth_tenant_ids() + is_super_admin(); bật RLS + policy cho
-- tenants, memberships, profiles, super_admins.
-- Nguyên tắc: RLS lo CÁCH LY TENANT; RBAC vai trò kiểm ở tầng app.

-- ---- Helper: tenant_ids mà user hiện tại là thành viên -----------------------
-- SECURITY DEFINER để không bị RLS trên memberships chặn (tránh đệ quy policy).
create or replace function public.auth_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.memberships
  where user_id = auth.uid() and active
$$;

-- ---- Helper: user hiện tại có phải super-admin không -------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.super_admins where user_id = auth.uid()
  )
$$;

-- ---- tenants ----------------------------------------------------------------
alter table public.tenants enable row level security;

drop policy if exists tenants_member_read on public.tenants;
create policy tenants_member_read on public.tenants
  for select
  using (id in (select public.auth_tenant_ids()) or public.is_super_admin());

-- Chỉ super-admin ghi tenants (owner không tự tạo/sửa tenant qua session RLS;
-- việc tạo tenant đi qua server action service_role).
drop policy if exists tenants_super_write on public.tenants;
create policy tenants_super_write on public.tenants
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---- memberships ------------------------------------------------------------
alter table public.memberships enable row level security;

drop policy if exists memberships_tenant_read on public.memberships;
create policy memberships_tenant_read on public.memberships
  for select
  using (tenant_id in (select public.auth_tenant_ids()) or public.is_super_admin());

drop policy if exists memberships_tenant_write on public.memberships;
create policy memberships_tenant_write on public.memberships
  for all
  using (tenant_id in (select public.auth_tenant_ids()) or public.is_super_admin())
  with check (tenant_id in (select public.auth_tenant_ids()) or public.is_super_admin());

-- ---- profiles ---------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select
  using (id = auth.uid() or public.is_super_admin());

drop policy if exists profiles_self_write on public.profiles;
create policy profiles_self_write on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- super_admins -----------------------------------------------------------
alter table public.super_admins enable row level security;

drop policy if exists super_admins_self_read on public.super_admins;
create policy super_admins_self_read on public.super_admins
  for select
  using (user_id = auth.uid());
