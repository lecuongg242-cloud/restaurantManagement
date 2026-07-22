-- 0012_bills_core.sql — Lõi bill/thanh toán (P4 / plan 04-01, §3.5).
-- bills + bill_items (phân bổ để tách/gộp) + payments + RLS tenant + index.
-- Giá integer VND, snapshot từ order_items.unit_price_snapshot (không đọc lại menu).
-- RLS: cách ly tenant qua auth_tenant_ids() (helper 0002). Thao tác nội bộ tenant (thu ngân) —
-- KHÔNG service role. Realtime cho POS (2 thu ngân cùng bàn) ở cuối file.

-- ---- bills ------------------------------------------------------------------
create table if not exists public.bills (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  bill_no               int,   -- số hóa đơn/ngày (reset 00:00 VN, gán ở app — giống kitchen_no)
  table_session_id      uuid references public.table_sessions (id) on delete set null,  -- null khi gộp nhiều bàn
  status                text not null default 'open' check (status in ('open', 'paid', 'void')),
  subtotal              int not null default 0 check (subtotal >= 0),
  discount_type         text not null default 'none' check (discount_type in ('none', 'amount', 'percent')),
  discount_value        int not null default 0 check (discount_value >= 0),  -- số tiền VND hoặc % [0,100]
  discount_amount       int not null default 0 check (discount_amount >= 0), -- tiền giảm đã tính
  service_charge_pct    int not null default 0 check (service_charge_pct between 0 and 100),
  service_charge_amount int not null default 0 check (service_charge_amount >= 0),
  vat_pct               int not null default 0 check (vat_pct between 0 and 100),
  vat_amount            int not null default 0 check (vat_amount >= 0),
  total                 int not null default 0 check (total >= 0),
  note                  text,
  created_by            uuid,   -- staff_membership mở bill
  closed_by             uuid,   -- staff_membership đóng bill (04-04)
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_bills_tenant_status
  on public.bills (tenant_id, status);
create index if not exists idx_bills_tenant_session
  on public.bills (tenant_id, table_session_id);
create index if not exists idx_bills_tenant_paid_at
  on public.bills (tenant_id, paid_at);

-- ---- bill_items (phân bổ order_items vào bill — tách/gộp qua qty_allocated) ---
create table if not exists public.bill_items (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  bill_id               uuid not null references public.bills (id) on delete cascade,
  order_item_id         uuid not null references public.order_items (id) on delete restrict,
  qty_allocated         int not null check (qty_allocated >= 1),
  unit_price_snapshot   int not null check (unit_price_snapshot >= 0),
  amount                int not null check (amount >= 0)  -- = unit_price_snapshot * qty_allocated
);

create index if not exists idx_bill_items_tenant_bill
  on public.bill_items (tenant_id, bill_id);
create index if not exists idx_bill_items_tenant_order_item
  on public.bill_items (tenant_id, order_item_id);

-- ---- payments ---------------------------------------------------------------
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  bill_id       uuid not null references public.bills (id) on delete cascade,
  method        text not null check (method in ('cash', 'transfer')),
  amount        int not null check (amount >= 0),
  received_by   uuid,   -- staff_membership thu tiền
  received_at   timestamptz not null default now(),
  note          text
);

create index if not exists idx_payments_tenant_bill
  on public.payments (tenant_id, bill_id);

-- ---- RLS (cách ly tenant; thu ngân thao tác dưới phiên station RLS) ----------
alter table public.bills enable row level security;
drop policy if exists bills_tenant_all on public.bills;
create policy bills_tenant_all on public.bills
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.bill_items enable row level security;
drop policy if exists bill_items_tenant_all on public.bill_items;
create policy bill_items_tenant_all on public.bill_items
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.payments enable row level security;
drop policy if exists payments_tenant_all on public.payments;
create policy payments_tenant_all on public.payments
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- ---- Realtime: POS subscribe bills (2 thu ngân cùng bàn thấy nhau). ----------
alter publication supabase_realtime add table public.bills;
