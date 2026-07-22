-- 0014_reservations.sql — Đặt bàn online (P5 / plan 05-01, RESV-01/02).
-- reservations + RLS tenant + index (theo ngày / theo trạng thái) + realtime.
-- Khách gửi đặt bàn qua SERVICE ROLE (scope theo slug ở server, D15) — KHÔNG policy anon.
-- area_id gợi ý khu vực (không giữ bàn, không mở phiên — QD-008 D-P5-2). Giờ hiển thị theo VN (UTC+7).

create table if not exists public.reservations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  customer_name   text not null,
  customer_phone  text not null,
  party_size      int not null check (party_size >= 1),
  reserved_at     timestamptz not null,          -- ngày giờ khách muốn (UTC; hiển thị giờ VN)
  note            text,
  status          text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  area_id         uuid references public.areas (id) on delete set null,  -- gợi ý khu vực (không giữ bàn)
  decided_by      uuid,   -- membership duyệt (03-xx pattern)
  decided_at      timestamptz,
  reject_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_reservations_tenant_reserved
  on public.reservations (tenant_id, reserved_at);
create index if not exists idx_reservations_tenant_status
  on public.reservations (tenant_id, status);

-- ---- RLS (cách ly tenant; khách gửi qua service role — không policy anon) ----
alter table public.reservations enable row level security;
drop policy if exists reservations_tenant_all on public.reservations;
create policy reservations_tenant_all on public.reservations
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- ---- Realtime: quản lý /admin/reservations nghe đơn mới pop (postgres_changes, RLS lọc tenant).
alter publication supabase_realtime add table public.reservations;
