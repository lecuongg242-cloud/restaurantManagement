-- 0072 — Lần mất kết nối gần nhất của cầu in (P17 17-02, OFFLINE-02/03).
--
-- Khi wifi quán mất, cầu in ngừng báo sống; khi nó lên lại (wifi quán về, hoặc tự nối hotspot điện thoại quản
-- lý) thì nhịp tim đầu tiên cách nhịp trước > 90 giây. Server tự ghi khoảng hở đó — không cần cầu in bản mới
-- (cầu in ở quán không phải cập nhật), và mốc giờ đều do database ghi.
--
-- Chỉ thêm cột + thay thân hàm cùng chữ ký (5 tham số, 0054). Không đổi quyền, không đổi RLS.

alter table public.printer_heartbeats
  add column if not exists last_gap_from    timestamptz,
  add column if not exists last_gap_seconds integer;

comment on column public.printer_heartbeats.last_gap_from is
  'Lúc cầu in bắt đầu mất kết nối lần gần nhất (= seen_at trước khoảng hở > 90 giây). 0072.';
comment on column public.printer_heartbeats.last_gap_seconds is
  'Khoảng hở đó dài bao nhiêu giây (tới nhịp tim nối lại). 0072.';

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
    -- Khoảng hở > 90 giây (cùng ngưỡng NGUONG_MAT_KET_NOI_MS của POS) = một lần mất kết nối. Đọc seen_at CŨ
    -- (bảng đích) trước khi nó bị ghi đè — trong UPDATE mọi biểu thức đều thấy giá trị cũ.
    last_gap_from      = case when v_now - public.printer_heartbeats.seen_at > interval '90 seconds'
                              then public.printer_heartbeats.seen_at
                              else public.printer_heartbeats.last_gap_from end,
    last_gap_seconds   = case when v_now - public.printer_heartbeats.seen_at > interval '90 seconds'
                              then extract(epoch from v_now - public.printer_heartbeats.seen_at)::integer
                              else public.printer_heartbeats.last_gap_seconds end,
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

notify pgrst, 'reload schema';
