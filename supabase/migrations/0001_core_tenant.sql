-- 0001_core_tenant.sql — Schema lõi multi-tenant (P1 / plan 01-02, §3.1).
-- tenants, profiles, memberships, super_admins. RLS bật ở 0002.
-- Quy ước: khóa chính uuid (gen_random_uuid), created_at timestamptz.

create extension if not exists pgcrypto;

-- ---- tenants ----------------------------------------------------------------
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  subdomain   text unique,                       -- chừa sẵn cho V2 (nullable)
  logo_url    text,
  settings    jsonb not null default '{}'::jsonb, -- currency, vat_pct, service_charge_pct...
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tenants_slug on public.tenants (slug);

-- ---- profiles (owner/manager & tài khoản trạm) ------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- ---- memberships ------------------------------------------------------------
-- user_id NULL  → nhân viên PIN-only (cashier/waiter/kitchen) không có tài khoản Supabase.
-- user_id NOT NULL → owner/manager/station (là "cửa" RLS).
create table if not exists public.memberships (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,   -- NULLABLE (D7)
  role          text not null check (role in ('owner', 'manager', 'cashier', 'waiter', 'kitchen', 'station')),
  display_name  text,
  pin_hash      text,                                                -- bcrypt PIN 4 số (nhân viên trạm)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_memberships_tenant on public.memberships (tenant_id);
create index if not exists idx_memberships_user   on public.memberships (user_id);

-- Một user chỉ có 1 membership/tenant (owner/manager/station).
create unique index if not exists uniq_membership_tenant_user
  on public.memberships (tenant_id, user_id)
  where user_id is not null;

-- ---- super_admins -----------------------------------------------------------
create table if not exists public.super_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
