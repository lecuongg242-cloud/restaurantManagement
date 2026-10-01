-- 0082_table_groups.sql — Ghép bàn khi mở cho khách đoàn (P23, QD-029, TABLE-03..06).
--
-- MÔ HÌNH: một nhóm = MỘT phiên (`table_sessions`) gắn nhiều bàn. Bàn của phiên là BÀN CHÍNH; các bàn ghép
-- thêm là BÀN PHỤ, trỏ về phiên qua `tables.group_session_id`. Hóa đơn, tách bill, `pay_bill` và tự đóng phiên
-- vốn chạy theo phiên ⇒ cả nhóm dùng chung các đường đó mà không phải sửa phần tiền.
--
-- KHÔNG GẮN KHÓA NGOẠI cho `tables.group_session_id`, CÓ CHỦ ĐÍCH: thêm một quan hệ thứ hai giữa `tables` và
-- `table_sessions` làm PostgREST không còn biết chọn đường nào khi nhúng `table_sessions(tables(name))` (lỗi
-- PGRST201) — đúng kiểu nhúng mà màn bếp, phiếu bếp, phiếu khách và hóa đơn đang dùng. Toàn vẹn giữ bằng
-- function dưới đây (đường ghi duy nhất) + đường đóng phiên (xóa trỏ khi phiên đóng).
--
-- `orders.table_id` = bàn GỌI của đơn (chạm B3 rồi gọi, hoặc khách quét QR B3). Null = đơn cũ / bàn chính.

alter table public.tables add column if not exists group_session_id uuid;
create index if not exists idx_tables_group_session
  on public.tables (group_session_id) where group_session_id is not null;

alter table public.orders
  add column if not exists table_id uuid references public.tables (id) on delete set null;

-- ---- set_table_group: đặt danh sách bàn phụ của nhóm có bàn chính p_main ------------------------------------------
-- p_tables = TOÀN BỘ bàn phụ mong muốn (không phải phần thêm): thiếu bàn nào đang ở nhóm là bỏ ghép bàn đó. Gửi lại
-- cùng danh sách ⇒ không đổi gì. Kiểm hết rồi mới ghi: có bàn bị từ chối thì KHÔNG ghi gì, trả lý do từng bàn.
--
-- BẢO MẬT: `security invoker` ⇒ RLS tenant (0007/0008) áp nguyên vẹn; thêm `tenant_id = p_tenant` ở mọi mệnh đề.
create or replace function public.set_table_group(
  p_tenant uuid,
  p_main   uuid,
  p_tables uuid[],
  p_actor  uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_main_group uuid;
  v_session    uuid;
  v_split      boolean;
  v_want       uuid[];
  v_current    uuid[];
  v_add        uuid[];
  v_remove     uuid[];
  v_reject     jsonb := '[]'::jsonb;
  v_t          record;
  v_own        uuid;
  v_n          int;
  v_group_main text;
begin
  v_want := array(
    select distinct x from unnest(coalesce(p_tables, '{}'::uuid[])) x where x is not null and x <> p_main
  );

  -- Khóa bàn chính + mọi bàn được xin, theo thứ tự id (hai máy ghép chéo nhau không khóa vòng).
  perform 1 from public.tables
   where tenant_id = p_tenant and (id = p_main or id = any(v_want))
   order by id
   for update;

  select group_session_id into v_main_group
    from public.tables where id = p_main and tenant_id = p_tenant;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  -- Bàn phụ không làm bàn chính của nhóm khác (UI luôn gửi bàn chính của nhóm).
  if v_main_group is not null then
    return jsonb_build_object('ok', false, 'code', 'main_is_member');
  end if;

  select id into v_session
    from public.table_sessions
   where tenant_id = p_tenant and table_id = p_main and status = 'open';

  if v_session is not null then
    perform 1 from public.tables
     where tenant_id = p_tenant and group_session_id = v_session
     order by id
     for update;
  end if;

  v_current := array(
    select id from public.tables where tenant_id = p_tenant and v_session is not null and group_session_id = v_session
  );
  v_add := array(select unnest(v_want) except select unnest(v_current));
  v_remove := array(select unnest(v_current) except select unnest(v_want));

  v_split := v_session is not null and exists (
    select 1 from public.bills b
     where b.tenant_id = p_tenant and b.table_session_id = v_session and b.status = 'open' and b.split_count is not null
  );

  -- ---- Kiểm bàn thêm vào ----
  for v_t in
    select t.id, t.name, t.group_session_id from public.tables t where t.tenant_id = p_tenant and t.id = any(v_add)
  loop
    if v_t.group_session_id is not null then
      select mt.name into v_group_main
        from public.table_sessions s join public.tables mt on mt.id = s.table_id
       where s.id = v_t.group_session_id;
      v_reject := v_reject || jsonb_build_object('id', v_t.id, 'name', v_t.name, 'reason', 'other_group', 'group', v_group_main);
      continue;
    end if;

    select id into v_own
      from public.table_sessions
     where tenant_id = p_tenant and table_id = v_t.id and status = 'open';
    if v_own is null then
      continue;
    end if;

    -- Bàn chính của MỘT NHÓM KHÁC: chuyển món + đóng phiên của nó sẽ bỏ các bàn phụ kia trỏ vào phiên đã đóng.
    if exists (select 1 from public.tables t2 where t2.tenant_id = p_tenant and t2.group_session_id = v_own) then
      v_reject := v_reject || jsonb_build_object('id', v_t.id, 'name', v_t.name, 'reason', 'other_group', 'group', v_t.name);
      continue;
    end if;

    -- Bàn có món mà đã vào hóa đơn (của phiên đó, hoặc hóa đơn gộp bàn) ⇒ không chuyển món được nữa.
    if exists (select 1 from public.bills b where b.tenant_id = p_tenant and b.table_session_id = v_own)
       or exists (
         select 1 from public.bill_items bi
           join public.order_items oi on oi.id = bi.order_item_id
           join public.orders o on o.id = oi.order_id
          where bi.tenant_id = p_tenant and o.table_session_id = v_own
       ) then
      v_reject := v_reject || jsonb_build_object('id', v_t.id, 'name', v_t.name, 'reason', 'has_bill');
      continue;
    end if;

    -- Nhóm đang chia đều: thêm món vào làm Σ con < vỏ (BILL-06) ⇒ chỉ cho ghép bàn không có món.
    if v_split and exists (select 1 from public.orders o where o.tenant_id = p_tenant and o.table_session_id = v_own) then
      v_reject := v_reject || jsonb_build_object('id', v_t.id, 'name', v_t.name, 'reason', 'main_split');
    end if;
  end loop;

  if exists (
    select 1 from unnest(v_add) a where not exists (select 1 from public.tables t where t.tenant_id = p_tenant and t.id = a)
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- ---- Kiểm bàn bỏ ghép: mọi món gọi từ bàn đó phải đã thu (served) hoặc đã hủy ----
  for v_t in
    select t.id, t.name from public.tables t where t.tenant_id = p_tenant and t.id = any(v_remove)
  loop
    select count(*) into v_n
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.tenant_id = p_tenant
       and o.table_session_id = v_session
       and o.table_id = v_t.id
       and o.status <> 'cancelled'
       and oi.status not in ('served', 'cancelled');
    if v_n > 0 then
      v_reject := v_reject || jsonb_build_object('id', v_t.id, 'name', v_t.name, 'reason', 'unpaid', 'count', v_n);
    end if;
  end loop;

  if jsonb_array_length(v_reject) > 0 then
    return jsonb_build_object('ok', false, 'code', 'rejected', 'tables', v_reject);
  end if;

  -- ---- Ghi ----
  if coalesce(array_length(v_add, 1), 0) > 0 and v_session is null then
    insert into public.table_sessions (tenant_id, table_id, status, opened_by)
    values (p_tenant, p_main, 'open', p_actor)
    returning id into v_session;
  end if;

  for v_t in select a as id from unnest(v_add) a loop
    select id into v_own
      from public.table_sessions
     where tenant_id = p_tenant and table_id = v_t.id and status = 'open';
    if v_own is not null then
      -- Món của bàn chuyển vào nhóm, giữ bàn gọi là bàn đó; phiên cũ (không có hóa đơn — đã kiểm) đóng lại.
      update public.orders
         set table_session_id = v_session, table_id = coalesce(table_id, v_t.id)
       where tenant_id = p_tenant and table_session_id = v_own;
      update public.table_sessions
         set status = 'closed', closed_at = now()
       where id = v_own and tenant_id = p_tenant;
    end if;
    update public.tables
       set group_session_id = v_session, status = 'occupied'
     where id = v_t.id and tenant_id = p_tenant;
  end loop;

  if coalesce(array_length(v_remove, 1), 0) > 0 then
    update public.tables
       set group_session_id = null, status = 'available'
     where tenant_id = p_tenant and id = any(v_remove);
  end if;

  -- Chạm dòng bàn chính: `table_sessions` không nằm trong realtime, `tables` thì có ⇒ máy POS khác tải lại.
  if v_session is not null then
    update public.tables set status = 'occupied' where id = p_main and tenant_id = p_tenant;
  end if;

  return jsonb_build_object('ok', true, 'session_id', v_session);
end;
$$;

revoke execute on function public.set_table_group(uuid, uuid, uuid[], uuid) from public, anon;
grant execute on function public.set_table_group(uuid, uuid, uuid[], uuid) to authenticated;

-- ---- Không xóa bàn đang thuộc một nhóm (mở rộng 0074) ----------------------------------------------------------------
create or replace function public.tables_block_delete_open()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Xóa cả quán (cascade từ tenants): dòng tenant đã đi trước ⇒ không chặn.
  if (old.group_session_id is not null
      or exists (select 1 from public.table_sessions s where s.table_id = old.id and s.status = 'open'))
     and exists (select 1 from public.tenants tn where tn.id = old.tenant_id) then
    raise exception 'Bàn "%" đang có khách — thanh toán hoặc chuyển bàn trước khi xóa.', old.name
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;
