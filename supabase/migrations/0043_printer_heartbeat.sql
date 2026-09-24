-- 0043 — Nhịp tim cầu in (PRINT-08) + trạng thái phiếu `superseded` (PRINT-06). 09-03.
--
-- VÌ SAO: 24/09/2026 cầu in qt-food chết khi xóa database Mỹ và không ai biết. Nút "Phiếu bếp" ở
-- chế độ cầu in chỉ XẾP phiếu vào hàng đợi; cầu in chết thì xếp vẫn thành công → phiếu nằm
-- `pending` mãi. Với nhịp tim, server biết cầu in đã chết và cho POS in trình duyệt thay vì xếp hàng.

-- ── Nhịp tim ────────────────────────────────────────────────────────────────────
create table if not exists public.printer_heartbeats (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  seen_at   timestamptz not null default now()
);

alter table public.printer_heartbeats enable row level security;

-- Đọc: thành viên của quán — POS cần để quyết đường in.
-- KHÔNG có policy ghi nào: giả được nhịp tim là giả được "cầu in còn sống" → phiếu bếp lại đi vào
-- hàng đợi không ai lấy. Ghi chỉ qua printer_heartbeat() bên dưới.
create policy printer_heartbeats_select on public.printer_heartbeats
  for select using (tenant_id in (select public.auth_tenant_ids()));

-- Mốc giờ là now() của DATABASE, không nhận tham số giờ từ laptop: đồng hồ laptop ở quán lệch được
-- (p50 printed_at − created_at = 6,5 giây trong khi nhịp poll là 2 giây). Tenant suy từ membership
-- `printer` của người gọi — không có tham số nào để chỉ định quán, nên không báo sống hộ quán khác được.
-- Đi qua auth_tenant_ids() nên quán bị tạm ngưng (0039) cũng không báo sống được.
create or replace function public.printer_heartbeat()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_now    timestamptz := now();
begin
  select m.tenant_id into v_tenant
  from public.memberships m
  where m.user_id = auth.uid()
    and m.role = 'printer'
    and m.active
    and m.tenant_id in (select public.auth_tenant_ids())
  limit 1;

  if v_tenant is null then
    raise exception 'chi tai khoan cau in moi bao nhip tim duoc' using errcode = '42501';
  end if;

  insert into public.printer_heartbeats (tenant_id, seen_at)
  values (v_tenant, v_now)
  on conflict (tenant_id) do update set seen_at = excluded.seen_at;

  return v_now;
end;
$$;

revoke all on function public.printer_heartbeat() from public, anon;
grant execute on function public.printer_heartbeat() to authenticated;

-- ── Trạng thái superseded ───────────────────────────────────────────────────────
-- In lại một phiếu bếp → các lượt còn `pending` của cùng đơn chuyển `superseded`, để cầu in sống
-- lại KHÔNG in thêm tờ cũ. Trạng thái riêng, không dùng `failed`: `failed` là tín hiệu báo động lỗi
-- dồn dập (PRINT-07), trộn vào là báo động giả.
alter table public.print_jobs drop constraint if exists print_jobs_status_check;
alter table public.print_jobs add constraint print_jobs_status_check
  check (status in ('pending', 'printed', 'failed', 'superseded'));
