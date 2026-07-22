-- 0008_orders_core.sql — Lõi order (P3 / plan 03-01, §3.3–3.4).
-- table_sessions + orders + order_items + order_item_modifiers + RLS tenant + index.
-- Giá lưu integer VND (snapshot lúc tạo order — không phụ thuộc menu đổi sau).
-- RLS: cách ly tenant qua auth_tenant_ids() (helper 0002). Khách anon KHÔNG có policy;
-- mọi ghi của khách đi qua service role ở server (D15). Realtime cho POS/KDS ở cuối file.

-- ---- table_sessions ---------------------------------------------------------
create table if not exists public.table_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  table_id    uuid not null references public.tables (id) on delete cascade,
  status      text not null default 'open' check (status in ('open', 'closed')),
  opened_at   timestamptz not null default now(),
  closed_at   timestamptz,
  opened_by   uuid  -- staff_membership id nullable (khách QR mở → null)
);

-- 1 phiên mở/bàn tại 1 thời điểm (D3): partial unique chỉ trên phiên open.
create unique index if not exists uniq_table_session_open
  on public.table_sessions (table_id) where status = 'open';

create index if not exists idx_table_sessions_tenant_table
  on public.table_sessions (tenant_id, table_id);

-- ---- orders -----------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  table_session_id  uuid references public.table_sessions (id) on delete set null,
  channel           text not null default 'dine_in'
                    check (channel in ('dine_in', 'takeaway', 'delivery')),
  source            text not null check (source in ('qr', 'staff')),
  status            text not null default 'pending_confirm'
                    check (status in ('pending_confirm', 'confirmed', 'preparing',
                                      'ready', 'served', 'completed', 'cancelled')),
  customer_contact  jsonb,
  note              text,
  created_by        uuid,   -- staff_membership id (null nếu khách QR)
  confirmed_by      uuid,   -- staff_membership id duyệt (03-02)
  confirmed_at      timestamptz,  -- mốc đo ≤3s ở 03-03
  cancel_reason     text,   -- lý do hủy cả đơn (03-04)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_orders_tenant_status
  on public.orders (tenant_id, status);
create index if not exists idx_orders_tenant_session
  on public.orders (tenant_id, table_session_id);

-- ---- order_items ------------------------------------------------------------
create table if not exists public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  order_id              uuid not null references public.orders (id) on delete cascade,
  menu_item_id          uuid references public.menu_items (id) on delete set null,
  name_snapshot         text not null,
  unit_price_snapshot   int not null check (unit_price_snapshot >= 0),  -- base + Σ price_delta
  qty                   int not null check (qty >= 1),
  note                  text,
  status                text not null default 'queued'
                        check (status in ('queued', 'preparing', 'ready', 'served', 'cancelled')),
  cancel_reason         text,   -- 03-04
  cancelled_by          uuid,   -- staff_membership manager/cashier (03-04)
  prepared_at           timestamptz,  -- mốc bếp làm xong (03-03)
  created_at            timestamptz not null default now()
);

create index if not exists idx_order_items_tenant_order
  on public.order_items (tenant_id, order_id);
create index if not exists idx_order_items_tenant_status
  on public.order_items (tenant_id, status);

-- ---- order_item_modifiers ---------------------------------------------------
create table if not exists public.order_item_modifiers (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  order_item_id         uuid not null references public.order_items (id) on delete cascade,
  option_id             uuid,   -- tham chiếu lỏng: option có thể bị xóa sau, giữ snapshot
  name_snapshot         text not null,
  price_delta_snapshot  int not null default 0
);

create index if not exists idx_order_item_modifiers_item
  on public.order_item_modifiers (order_item_id);

-- ---- RLS (cách ly tenant; khách anon đi qua service role) --------------------
alter table public.table_sessions enable row level security;
drop policy if exists table_sessions_tenant_all on public.table_sessions;
create policy table_sessions_tenant_all on public.table_sessions
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.orders enable row level security;
drop policy if exists orders_tenant_all on public.orders;
create policy orders_tenant_all on public.orders
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.order_items enable row level security;
drop policy if exists order_items_tenant_all on public.order_items;
create policy order_items_tenant_all on public.order_items
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.order_item_modifiers enable row level security;
drop policy if exists order_item_modifiers_tenant_all on public.order_item_modifiers;
create policy order_item_modifiers_tenant_all on public.order_item_modifiers
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- ---- Realtime (§6): POS/KDS subscribe postgres_changes (RLS lọc theo phiên station).
-- Khách anon KHÔNG dùng postgres_changes (RLS chặn) → dùng Broadcast ở app (quyết định P3 #1).
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
