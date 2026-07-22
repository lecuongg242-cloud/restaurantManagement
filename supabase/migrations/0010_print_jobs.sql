-- 0010_print_jobs.sql — Hàng đợi/log in (P3 / plan 03-05, §3.7).
-- V1: ghi log mỗi lần in (status=printed). V1.x: cầu in ESC/POS poll status=pending.
-- RLS tenant qua auth_tenant_ids() (mẫu 0008). (Số 0010 vì 0009 đã dùng cho realtime_tables.)

create table if not exists public.print_jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  type            text not null check (type in ('receipt', 'kitchen_ticket')),
  target_station  text,
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending', 'printed', 'failed')),
  created_at      timestamptz not null default now(),
  printed_at      timestamptz
);

create index if not exists idx_print_jobs_tenant_status_created
  on public.print_jobs (tenant_id, status, created_at);

alter table public.print_jobs enable row level security;
drop policy if exists print_jobs_tenant_all on public.print_jobs;
create policy print_jobs_tenant_all on public.print_jobs
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));
