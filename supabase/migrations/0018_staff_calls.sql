-- 0018_staff_calls.sql — "Gọi nhân viên" từ menu khách (QR) → hiện realtime trên POS.
--
-- Khách quét QR tại bàn, bấm "Gọi nhân viên" → insert 1 dòng (qua service role, khách ẩn danh).
-- POS subscribe postgres_changes bảng này (RLS tenant) → hiện banner "bàn đang gọi"; nhân viên
-- bấm "Đã xử lý" → status='resolved'. RLS chỉ cách ly tenant (mẫu 0002/0008).

create table if not exists public.staff_calls (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  table_id     uuid not null references public.tables (id) on delete cascade,
  table_name   text not null,                       -- snapshot tên bàn để hiện nhanh
  status       text not null default 'pending' check (status in ('pending', 'resolved')),
  note         text,                                -- lý do (V1 để trống)
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.memberships (id) on delete set null
);

-- Truy vấn "đang gọi" của tenant.
create index if not exists idx_staff_calls_tenant_status
  on public.staff_calls (tenant_id, status, created_at);
-- Dedupe: tra nhanh call pending gần đây của 1 bàn.
create index if not exists idx_staff_calls_table_pending
  on public.staff_calls (table_id, status, created_at);

-- ---- RLS (cách ly tenant) ---------------------------------------------------
alter table public.staff_calls enable row level security;

drop policy if exists staff_calls_tenant_read on public.staff_calls;
create policy staff_calls_tenant_read on public.staff_calls
  for select
  using (tenant_id in (select public.auth_tenant_ids()) or public.is_super_admin());

drop policy if exists staff_calls_tenant_write on public.staff_calls;
create policy staff_calls_tenant_write on public.staff_calls
  for all
  using (tenant_id in (select public.auth_tenant_ids()) or public.is_super_admin())
  with check (tenant_id in (select public.auth_tenant_ids()) or public.is_super_admin());

-- ---- Realtime ---------------------------------------------------------------
-- POS nhận INSERT/UPDATE để cập nhật banner cross-window (mẫu 0009).
alter publication supabase_realtime add table public.staff_calls;
