-- 0053 — Nhịp tim kèm PHIÊN BẢN cầu in (PRINT-12/13, QD-019 D8, P11 11-06).
--
-- Cầu in tự cập nhật; super-admin cần biết quán nào đang chạy bản cũ (tự cập nhật chưa tới / hỏng).

alter table public.printer_heartbeats
  add column if not exists version integer;

-- Thay hàm 2 tham số (0044) bằng hàm 3 tham số. BỎ bản cũ: để cả hai cùng tồn tại thì PostgREST không
-- chọn được hàm nào khi cầu in gọi `{p_printer_ok, p_printer_host}`. Migration chạy trong MỘT giao dịch
-- nên không có khoảnh khắc nào hàm biến mất với cầu in đang chạy ở quán.
drop function if exists public.printer_heartbeat(boolean, text);

-- Mọi tham số có mặc định: cầu in bản 0043 (không tham số) và 0044 (hai tham số) vẫn chạy, và KHÔNG
-- xóa phiên bản do bản mới ghi (coalesce).
create or replace function public.printer_heartbeat(
  p_printer_ok   boolean default null,
  p_printer_host text    default null,
  p_version      integer default null
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

  insert into public.printer_heartbeats (tenant_id, seen_at, printer_ok, printer_host, printer_checked_at, version)
  values (
    v_tenant,
    v_now,
    p_printer_ok,
    left(p_printer_host, 100),
    case when p_printer_ok is null then null else v_now end,
    p_version
  )
  on conflict (tenant_id) do update set
    seen_at            = excluded.seen_at,
    printer_ok         = coalesce(excluded.printer_ok,         public.printer_heartbeats.printer_ok),
    printer_host       = coalesce(excluded.printer_host,       public.printer_heartbeats.printer_host),
    printer_checked_at = coalesce(excluded.printer_checked_at, public.printer_heartbeats.printer_checked_at),
    version            = coalesce(excluded.version,            public.printer_heartbeats.version);

  return v_now;
end;
$$;

revoke all on function public.printer_heartbeat(boolean, text, integer) from public, anon;
grant execute on function public.printer_heartbeat(boolean, text, integer) to authenticated;

notify pgrst, 'reload schema';
