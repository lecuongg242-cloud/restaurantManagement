-- 0075 — Nguồn cầu in: cầu in cũ (tác vụ Windows `CauInBep`) hay app "TechMenu Thu ngân" (P21 21-02, DESK-05).
--
-- App máy quầy chạy chính scripts/print-bridge.mjs và báo thêm `p_agent` (vd `app/1.0.0`). Màn Máy in và /super hiện
-- nguồn để biết quán đã chuyển sang app chưa. Cầu in cũ không gửi `p_agent` ⇒ `agent` = null ("cầu in cũ").
--
-- `agent` ghi ĐÈ mỗi nhịp (không coalesce): quán quay lại cầu in cũ thì màn hiện đúng "cầu in cũ", và hai cầu in
-- cùng chạy cho một quán sẽ làm giá trị này đổi qua lại — dấu hiệu nhìn thấy được của in trùng.
--
-- Chỉ thêm một cột + thay hàm 5 tham số (0072) bằng 6 tham số. Không đổi quyền, không đổi RLS.

alter table public.printer_heartbeats
  add column if not exists agent text;

comment on column public.printer_heartbeats.agent is
  'Nguồn cầu in: null = cầu in cũ (CauInBep), "app/<phiên bản>" = app TechMenu Thu ngân. 0075.';

-- BỎ bản 5 tham số trước: hai bản cùng tồn tại thì PostgREST không chọn được hàm khi cầu in gọi (như 0054). Cả đợt chạy
-- trong MỘT giao dịch — không có lúc nào hàm biến mất.
drop function if exists public.printer_heartbeat(boolean, text, integer, boolean, text);

-- Mọi tham số có mặc định: cầu in bản cũ (0043 → 0072) vẫn gọi được.
create or replace function public.printer_heartbeat(
  p_printer_ok     boolean default null,
  p_printer_host   text    default null,
  p_version        integer default null,
  p_counter_ok     boolean default null,
  p_counter_target text    default null,
  p_agent          text    default null
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
    counter_ok, counter_target, counter_checked_at, agent
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
    case when p_counter_ok is null then null else v_now end,
    left(p_agent, 40)
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
    counter_checked_at = coalesce(excluded.counter_checked_at, public.printer_heartbeats.counter_checked_at),
    agent              = excluded.agent;

  return v_now;
end;
$$;

revoke all on function public.printer_heartbeat(boolean, text, integer, boolean, text, text) from public, anon;
grant execute on function public.printer_heartbeat(boolean, text, integer, boolean, text, text) to authenticated;

notify pgrst, 'reload schema';
