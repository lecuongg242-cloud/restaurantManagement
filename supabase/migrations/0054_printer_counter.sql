-- 0054 — Nhịp tim kèm MÁY IN QUẦY (PRINT-15/16, QD-020 D5–D6, P12 12-02).
--
-- Cầu in giờ in cả hóa đơn / phiếu khách ra máy in quầy (USB hoặc LAN) cho thiết bị không có máy in
-- (điện thoại, tablet). Server chỉ xếp hóa đơn vào hàng đợi khi cầu in đang sống VÀ đã khai máy in quầy
-- (`counter_target`), nếu không thì phiếu nằm chờ mà không ai in.

alter table public.printer_heartbeats
  add column if not exists counter_ok         boolean,
  add column if not exists counter_target     text,
  add column if not exists counter_checked_at timestamptz;

-- Thay hàm 3 tham số (0053) bằng 5 tham số. BỎ bản cũ trước: hai bản cùng tồn tại thì PostgREST không
-- chọn được hàm khi cầu in gọi. Cả đợt chạy trong MỘT giao dịch — không có lúc nào hàm biến mất.
drop function if exists public.printer_heartbeat(boolean, text, integer);

-- Mọi tham số có mặc định: cầu in bản cũ (0043 không tham số, 0044 hai tham số, 0053 ba tham số) vẫn chạy
-- và KHÔNG xóa dữ liệu máy in quầy do bản mới ghi (coalesce).
create or replace function public.printer_heartbeat(
  p_printer_ok     boolean default null,
  p_printer_host   text    default null,
  p_version        integer default null,
  p_counter_ok     boolean default null,
  p_counter_target text    default null
)
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

  insert into public.printer_heartbeats (
    tenant_id, seen_at, printer_ok, printer_host, printer_checked_at, version,
    counter_ok, counter_target, counter_checked_at
  )
  values (
    v_tenant,
    v_now,
    p_printer_ok,
    left(p_printer_host, 100),
    case when p_printer_ok is null then null else v_now end,
    p_version,
    p_counter_ok,
    left(p_counter_target, 150),
    case when p_counter_ok is null then null else v_now end
  )
  on conflict (tenant_id) do update set
    seen_at            = excluded.seen_at,
    printer_ok         = coalesce(excluded.printer_ok,         public.printer_heartbeats.printer_ok),
    printer_host       = coalesce(excluded.printer_host,       public.printer_heartbeats.printer_host),
    printer_checked_at = coalesce(excluded.printer_checked_at, public.printer_heartbeats.printer_checked_at),
    version            = coalesce(excluded.version,            public.printer_heartbeats.version),
    counter_ok         = coalesce(excluded.counter_ok,         public.printer_heartbeats.counter_ok),
    counter_target     = coalesce(excluded.counter_target,     public.printer_heartbeats.counter_target),
    counter_checked_at = coalesce(excluded.counter_checked_at, public.printer_heartbeats.counter_checked_at);

  return v_now;
end;
$$;

revoke all on function public.printer_heartbeat(boolean, text, integer, boolean, text) from public, anon;
grant execute on function public.printer_heartbeat(boolean, text, integer, boolean, text) to authenticated;

notify pgrst, 'reload schema';
