-- 0004_menu_core.sql — Schema menu lõi (P2 / plan 02-01, §3.2).
-- menu_categories + menu_items + RLS tenant + index. Giá lưu integer VND.
-- RLS: cách ly tenant qua auth_tenant_ids() (helper từ 0002). RBAC vai trò ở tầng app.

-- ---- menu_categories --------------------------------------------------------
create table if not exists public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_menu_categories_tenant_sort
  on public.menu_categories (tenant_id, sort_order);

-- ---- menu_items -------------------------------------------------------------
create table if not exists public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  category_id   uuid not null references public.menu_categories (id) on delete cascade,
  name          text not null,
  description   text,
  base_price    int not null default 0 check (base_price >= 0), -- VND integer
  image_url     text,
  is_available  boolean not null default true,
  sort_order    int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_menu_items_tenant_cat_sort
  on public.menu_items (tenant_id, category_id, sort_order);

-- ---- RLS --------------------------------------------------------------------
alter table public.menu_categories enable row level security;

drop policy if exists menu_categories_tenant_all on public.menu_categories;
create policy menu_categories_tenant_all on public.menu_categories
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.menu_items enable row level security;

drop policy if exists menu_items_tenant_all on public.menu_items;
create policy menu_items_tenant_all on public.menu_items
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));
