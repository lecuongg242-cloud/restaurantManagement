-- 0006_modifiers.sql — Nhóm tùy chọn + option + gắn N-N vào món (P2 / plan 02-02, §3.2).
-- modifier_groups, modifier_options, menu_item_modifier_groups + RLS tenant.
-- Bảng link mang tenant_id trực tiếp để policy RLS đồng nhất auth_tenant_ids().

-- ---- modifier_groups --------------------------------------------------------
create table if not exists public.modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  min_select  int not null default 0,
  max_select  int not null default 1,
  required    boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint modifier_groups_max_ge_min check (max_select >= min_select)
);

create index if not exists idx_modifier_groups_tenant_sort
  on public.modifier_groups (tenant_id, sort_order);

-- ---- modifier_options -------------------------------------------------------
create table if not exists public.modifier_options (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  group_id      uuid not null references public.modifier_groups (id) on delete cascade,
  name          text not null,
  price_delta   int not null default 0 check (price_delta >= 0), -- VND integer
  is_available  boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_modifier_options_group_sort
  on public.modifier_options (group_id, sort_order);

-- ---- menu_item_modifier_groups (N-N) ---------------------------------------
create table if not exists public.menu_item_modifier_groups (
  item_id     uuid not null references public.menu_items (id) on delete cascade,
  group_id    uuid not null references public.modifier_groups (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sort_order  int not null default 0,
  primary key (item_id, group_id)
);

create index if not exists idx_mimg_group on public.menu_item_modifier_groups (group_id);

-- ---- RLS --------------------------------------------------------------------
alter table public.modifier_groups enable row level security;
drop policy if exists modifier_groups_tenant_all on public.modifier_groups;
create policy modifier_groups_tenant_all on public.modifier_groups
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.modifier_options enable row level security;
drop policy if exists modifier_options_tenant_all on public.modifier_options;
create policy modifier_options_tenant_all on public.modifier_options
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.menu_item_modifier_groups enable row level security;
drop policy if exists mimg_tenant_all on public.menu_item_modifier_groups;
create policy mimg_tenant_all on public.menu_item_modifier_groups
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));
