-- 0007_areas_tables.sql — Khu vực + bàn + QR token (P2 / plan 02-03, §3.3).
-- areas, tables (qr_token unique tự sinh) + RLS tenant + index.
-- table_sessions KHÔNG tạo ở đây (để P3). qr_token ngẫu nhiên không đoán được.

-- ---- areas ------------------------------------------------------------------
create table if not exists public.areas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_areas_tenant_sort on public.areas (tenant_id, sort_order);

-- ---- tables -----------------------------------------------------------------
create table if not exists public.tables (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  area_id     uuid references public.areas (id) on delete set null,
  name        text not null,
  seats       int not null default 2 check (seats >= 1),
  qr_token    text not null unique default encode(gen_random_bytes(9), 'hex'),
  status      text not null default 'available'
              check (status in ('available', 'occupied', 'reserved', 'cleaning')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tables_tenant_area_sort
  on public.tables (tenant_id, area_id, sort_order);

-- ---- RLS --------------------------------------------------------------------
alter table public.areas enable row level security;
drop policy if exists areas_tenant_all on public.areas;
create policy areas_tenant_all on public.areas
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.tables enable row level security;
drop policy if exists tables_tenant_all on public.tables;
create policy tables_tenant_all on public.tables
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));
