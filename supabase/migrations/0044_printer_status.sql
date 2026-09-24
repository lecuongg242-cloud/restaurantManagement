-- 0044 — Nhịp tim kèm trạng thái MÁY IN (PRINT-09). 09-05.
--
-- Nhịp tim 0043 chỉ biết CẦU IN còn sống. Máy in rút dây mà cầu in vẫn chạy thì chỉ lộ ra khi có
-- phiếu `failed`. Cầu in giờ thử kết nối tới máy in mỗi nhịp tim và báo kèm.

alter table public.printer_heartbeats
  add column if not exists printer_ok         boolean,
  add column if not exists printer_host       text,
  add column if not exists printer_checked_at timestamptz;

-- Đổi chữ ký hàm. Bỏ bản không tham số: để cả hai cùng tồn tại thì PostgREST không chọn được hàm
-- nào khi cầu in gọi `{}`. Migration chạy trong MỘT giao dịch nên không có khoảnh khắc nào hàm biến
-- mất với cầu in đang chạy ở quán.
drop function if exists public.printer_heartbeat();

-- Tham số đều có mặc định: cầu in BẢN CŨ gọi không tham số vẫn chạy, và KHÔNG xóa kết quả máy in do
-- bản mới ghi (coalesce). Mốc thử máy in là now() của database — chỉ đặt khi có kết quả thử thật.
-- Địa chỉ cắt 100 ký tự: cột này do máy ở quán ghi, không tin độ dài.
create or replace function public.printer_heartbeat(
  p_printer_ok   boolean default null,
  p_printer_host text    default null
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

  insert into public.printer_heartbeats (tenant_id, seen_at, printer_ok, printer_host, printer_checked_at)
  values (
    v_tenant,
    v_now,
    p_printer_ok,
    left(p_printer_host, 100),
    case when p_printer_ok is null then null else v_now end
  )
  on conflict (tenant_id) do update set
    seen_at            = excluded.seen_at,
    printer_ok         = coalesce(excluded.printer_ok,         public.printer_heartbeats.printer_ok),
    printer_host       = coalesce(excluded.printer_host,       public.printer_heartbeats.printer_host),
    printer_checked_at = coalesce(excluded.printer_checked_at, public.printer_heartbeats.printer_checked_at);

  return v_now;
end;
$$;

revoke all on function public.printer_heartbeat(boolean, text) from public, anon;
grant execute on function public.printer_heartbeat(boolean, text) to authenticated;

notify pgrst, 'reload schema';
