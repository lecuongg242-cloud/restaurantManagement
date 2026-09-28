-- 0071_export_logs.sql — Nhật ký xuất file (P16 / plan 16-04, REPORT-19).
--
-- File Excel mang số kinh doanh và (với danh sách khách) SĐT khách ra khỏi hệ thống ⇒ ghi lại AI xuất, xuất GÌ,
-- khoảng ngày nào, lúc nào. Chỉ chủ / quản lý của chi nhánh đọc và ghi (manager_tenants, 0068). Chỉ thêm, không sửa.

create table if not exists public.export_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  membership_id uuid null,
  kind          text not null check (kind in ('report', 'report_chain', 'customers')),
  from_day      date null,
  to_day        date null,
  row_count     integer null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_export_logs_tenant on public.export_logs (tenant_id, created_at desc);

alter table public.export_logs enable row level security;

drop policy if exists export_logs_read on public.export_logs;
create policy export_logs_read on public.export_logs
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));

drop policy if exists export_logs_insert on public.export_logs;
create policy export_logs_insert on public.export_logs
  for insert with check (tenant_id = any (public.manager_tenants(array[tenant_id])));

revoke all on public.export_logs from anon;
revoke update, delete on public.export_logs from authenticated;
