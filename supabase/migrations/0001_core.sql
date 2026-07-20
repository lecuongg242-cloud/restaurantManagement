-- 0001_core.sql — Nền tảng multi-tenant (P1)
-- Bảng: profiles, tenants, memberships, tenant_invitations, super_admins
-- RLS bật trên MỌI bảng. Không bao giờ disable RLS (quy định P1).

-- =====================================================================
-- 1. BẢNG
-- =====================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name text not null,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.memberships (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'cashier', 'waiter', 'kitchen')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner', 'manager', 'cashier', 'waiter', 'kitchen')),
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index tenant_invitations_tenant_idx on public.tenant_invitations (tenant_id);
create index memberships_user_idx on public.memberships (user_id);

create table public.super_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 2. HÀM HELPER (security definer để tránh đệ quy RLS trên memberships)
-- =====================================================================

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from super_admins where user_id = auth.uid());
$$;

create or replace function public.current_tenant_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select tenant_id from memberships
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function public.has_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where tenant_id = p_tenant_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any (p_roles)
  );
$$;

-- =====================================================================
-- 3. TRIGGER: tự tạo profile khi user đăng ký
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 4. RPC: chấp nhận lời mời (luồng duy nhất tạo membership cho người được mời)
-- =====================================================================

create or replace function public.accept_invitation(p_token uuid)
returns text -- trả về slug của tenant
language plpgsql security definer
set search_path = public
as $$
declare
  v_invite tenant_invitations%rowtype;
  v_slug text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_invite
  from tenant_invitations
  where token = p_token
  for update;

  if not found or v_invite.status = 'revoked' then
    raise exception 'INVITE_INVALID';
  end if;

  if v_invite.status = 'accepted' then
    raise exception 'INVITE_ALREADY_USED';
  end if;

  if v_invite.expires_at < now() then
    update tenant_invitations set status = 'expired' where id = v_invite.id;
    raise exception 'INVITE_EXPIRED';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email <> v_invite.email then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  -- Tạo/kích hoạt lại membership đúng vai trò được mời
  insert into memberships (tenant_id, user_id, role, status)
  values (v_invite.tenant_id, auth.uid(), v_invite.role, 'active')
  on conflict (tenant_id, user_id)
  do update set role = excluded.role, status = 'active';

  update tenant_invitations set status = 'accepted' where id = v_invite.id;

  select slug into v_slug from tenants where id = v_invite.tenant_id;
  return v_slug;
end;
$$;

-- =====================================================================
-- 5. ROW LEVEL SECURITY
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.tenant_invitations enable row level security;
alter table public.super_admins enable row level security;

-- profiles: chỉ chính chủ
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- tenants
create policy "tenants_select_member_or_super" on public.tenants
  for select using (
    is_super_admin() or id in (select current_tenant_ids())
  );
create policy "tenants_insert_super" on public.tenants
  for insert with check (is_super_admin());
create policy "tenants_update_super_or_owner" on public.tenants
  for update using (is_super_admin() or has_role(id, array['owner']));
create policy "tenants_delete_super" on public.tenants
  for delete using (is_super_admin());

-- memberships: xem = chính mình hoặc quản lý tenant; sửa/xóa = owner hoặc super.
-- KHÔNG có policy insert cho người được mời — membership chỉ sinh ra qua
-- accept_invitation() (security definer) hoặc bởi owner/super-admin.
create policy "memberships_select" on public.memberships
  for select using (
    is_super_admin()
    or user_id = auth.uid()
    or has_role(tenant_id, array['owner', 'manager'])
  );
create policy "memberships_insert_admin" on public.memberships
  for insert with check (
    is_super_admin() or has_role(tenant_id, array['owner'])
  );
create policy "memberships_update_admin" on public.memberships
  for update using (
    is_super_admin() or has_role(tenant_id, array['owner'])
  );
create policy "memberships_delete_admin" on public.memberships
  for delete using (
    is_super_admin() or has_role(tenant_id, array['owner'])
  );

-- tenant_invitations: chỉ owner/manager của tenant (hoặc super) thao tác.
-- Người được mời KHÔNG select trực tiếp — đi qua accept_invitation(token).
create policy "invitations_select_admin" on public.tenant_invitations
  for select using (
    is_super_admin() or has_role(tenant_id, array['owner', 'manager'])
  );
create policy "invitations_insert_admin" on public.tenant_invitations
  for insert with check (
    (is_super_admin() or has_role(tenant_id, array['owner', 'manager']))
    and invited_by = auth.uid()
  );
create policy "invitations_update_admin" on public.tenant_invitations
  for update using (
    is_super_admin() or has_role(tenant_id, array['owner', 'manager'])
  );

-- super_admins: chỉ đọc chính mình; thêm/bớt qua migration hoặc service role.
create policy "super_admins_select_self" on public.super_admins
  for select using (user_id = auth.uid());
