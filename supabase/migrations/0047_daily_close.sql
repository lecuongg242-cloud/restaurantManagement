-- 0047_daily_close.sql — Chốt sổ ngày bất biến + tồn theo bản chốt (INV-08, INV-09, QD-017 D7). 10-03.
--
-- Bản chốt = MỘT dòng/ngày, payload jsonb đọc nguyên khối (không bao giờ sửa từng phần). BẤT BIẾN Ở
-- TẦNG DB: chỉ có policy select + insert, không có update/delete — sửa định lượng hôm nay không thể
-- làm đổi số của tháng trước. service_role vẫn sửa được (bỏ qua RLS); script nào chạm bảng này phải
-- nêu trong summary.

create table if not exists public.daily_closes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  business_date  date not null,
  closed_at      timestamptz not null default now(),
  closed_by      uuid,          -- null = tự chốt khi mở trang sau nửa đêm
  payload        jsonb not null,
  constraint daily_closes_one_per_day unique (tenant_id, business_date)
);

alter table public.daily_closes enable row level security;
drop policy if exists daily_closes_select on public.daily_closes;
create policy daily_closes_select on public.daily_closes
  for select using (tenant_id in (select public.auth_tenant_ids()));
drop policy if exists daily_closes_insert on public.daily_closes;
create policy daily_closes_insert on public.daily_closes
  for insert with check (tenant_id in (select public.auth_tenant_ids()));

-- ---- Lượng dùng theo đơn trong một khoảng [p_from, p_to) — tách từ 0046 để hai hàm dưới dùng chung.
-- Quy tắc QD-017 D2 giữ nguyên: đã xác nhận; món chưa hủy hoặc hủy SAU mốc in sớm nhất; lượng thô
-- = định lượng ÷ yield (chỉ nguyên liệu mua vào).
create or replace function public.inventory_usage(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (ingredient_id uuid, order_usage numeric, cancel_usage numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with used as (
    select oi.id, oi.menu_item_id, oi.qty, (oi.status = 'cancelled') as cancelled_after_print
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.tenant_id = p_tenant
      and o.tenant_id = p_tenant
      and o.confirmed_at is not null
      and o.confirmed_at >= p_from
      and o.confirmed_at <  p_to
      and (
        oi.status <> 'cancelled'
        or oi.cancelled_at > (
          select min(j.created_at)
          from public.print_jobs j
          where j.tenant_id = p_tenant
            and j.type = 'kitchen_ticket'
            and j.payload ->> 'orderId' = oi.order_id::text
        )
      )
  ),
  lines as (
    select rl.ingredient_id, u.qty * rl.qty as qty, u.cancelled_after_print
    from used u
    join public.recipe_lines rl on rl.menu_item_id = u.menu_item_id and rl.tenant_id = p_tenant
    union all
    select rl.ingredient_id, u.qty * rl.qty, u.cancelled_after_print
    from used u
    join public.order_item_modifiers m on m.order_item_id = u.id
    join public.recipe_lines rl on rl.modifier_option_id = m.option_id and rl.tenant_id = p_tenant
  )
  select l.ingredient_id,
    round(sum(l.qty * 100.0 / case when i.kind = 'purchased' then i.yield_pct else 100 end), 3),
    round(coalesce(sum(l.qty * 100.0 / case when i.kind = 'purchased' then i.yield_pct else 100 end)
      filter (where l.cancelled_after_print), 0), 3)
  from lines l
  join public.ingredients i on i.id = l.ingredient_id
  group by l.ingredient_id;
$$;

revoke all on function public.inventory_usage(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.inventory_usage(uuid, timestamptz, timestamptz) to authenticated;

-- ---- Tồn lý thuyết (thay bản 0046): mốc gốc = bản chốt gần nhất TRƯỚC ngày của p_at ------------
-- Có bản chốt ngày D: tồn đầu = closing của D; cộng sổ có business_date > D; đơn từ 00:00 (giờ VN)
-- ngày D+1. Chưa có bản chốt nào: như 0046 — từ dòng sổ đầu tiên của quán, tồn đầu 0.
-- Danh sách cột trả về giữ nguyên 0046 → create or replace được, không phải drop.
create or replace function public.inventory_on_hand(
  p_tenant uuid,
  p_at     timestamptz default now()
)
returns table (
  ingredient_id  uuid,
  opening        numeric,
  receipts       numeric,
  batch_in       numeric,
  batch_out      numeric,
  waste          numeric,
  adjust         numeric,
  order_usage    numeric,
  cancel_usage   numeric,
  on_hand        numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with last_close as (
    select dc.business_date, dc.payload
    from public.daily_closes dc
    where dc.tenant_id = p_tenant
      and dc.business_date < (p_at at time zone 'Asia/Ho_Chi_Minh')::date
    order by dc.business_date desc
    limit 1
  ),
  base as (
    select
      (select business_date from last_close) as close_date,
      coalesce(
        ((select business_date from last_close) + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh',
        (select min(se.created_at) from public.stock_entries se where se.tenant_id = p_tenant)
      ) as start_at
  ),
  opening as (
    select (x ->> 'id')::uuid as ingredient_id, (x ->> 'closing')::numeric as qty
    from last_close, jsonb_array_elements(last_close.payload -> 'ingredients') x
  ),
  ledger as (
    select se.ingredient_id,
      sum(se.qty) filter (where se.kind = 'receipt')      as receipts,
      sum(se.qty) filter (where se.kind = 'batch_in')     as batch_in,
      sum(se.qty) filter (where se.kind = 'batch_out')    as batch_out,
      sum(se.qty) filter (where se.kind = 'waste')        as waste,
      sum(se.qty) filter (where se.kind = 'count_adjust') as adjust
    from public.stock_entries se, base
    where se.tenant_id = p_tenant
      and se.created_at < p_at
      and (base.close_date is null or se.business_date > base.close_date)
    group by se.ingredient_id
  ),
  usage as (
    select u.* from base, public.inventory_usage(p_tenant, base.start_at, p_at) u
    where base.start_at is not null
  )
  select i.id,
    coalesce(op.qty, 0),
    coalesce(lg.receipts, 0),
    coalesce(lg.batch_in, 0),
    coalesce(-lg.batch_out, 0),
    coalesce(-lg.waste, 0),
    coalesce(lg.adjust, 0),
    coalesce(us.order_usage, 0),
    coalesce(us.cancel_usage, 0),
    round(
      coalesce(op.qty, 0) + coalesce(lg.receipts, 0) + coalesce(lg.batch_in, 0) + coalesce(lg.batch_out, 0)
      + coalesce(lg.waste, 0) + coalesce(lg.adjust, 0) - coalesce(us.order_usage, 0),
      3)
  from public.ingredients i
  left join opening op on op.ingredient_id = i.id
  left join ledger  lg on lg.ingredient_id = i.id
  left join usage   us on us.ingredient_id = i.id
  where i.tenant_id = p_tenant
    and (op.ingredient_id is not null or lg.ingredient_id is not null or us.ingredient_id is not null);
$$;

-- ---- Số liệu MỘT ngày kinh doanh cho bản chốt ------------------------------------------------
-- Tồn đầu = tồn lý thuyết lúc 00:00 (giờ VN) ngày đó. Sổ theo business_date. Đơn trong ngày, không
-- sớm hơn dòng sổ đầu tiên của quán (quán bật tính năng giữa ngày).
create or replace function public.inventory_day(p_tenant uuid, p_date date)
returns table (
  ingredient_id    uuid,
  opening          numeric,
  receipts         numeric,
  batch_in         numeric,
  batch_out        numeric,
  waste_hong       numeric,
  waste_do_bo      numeric,
  waste_com_nv     numeric,
  waste_khac       numeric,
  adjust           numeric,
  counted          boolean,
  order_usage      numeric,
  cancel_usage     numeric,
  batch_shortfall  numeric,
  closing          numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with win as (
    select
      p_date::timestamp at time zone 'Asia/Ho_Chi_Minh'        as day_start,
      (p_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'  as day_end,
      (select min(se.created_at) from public.stock_entries se where se.tenant_id = p_tenant) as first_at
  ),
  opening as (
    select oh.ingredient_id, oh.on_hand as qty
    from win, public.inventory_on_hand(p_tenant, win.day_start) oh
  ),
  ledger as (
    select se.ingredient_id,
      sum(se.qty) filter (where se.kind = 'receipt')                          as receipts,
      sum(se.qty) filter (where se.kind = 'batch_in')                         as batch_in,
      sum(se.qty) filter (where se.kind = 'batch_out')                        as batch_out,
      sum(se.qty) filter (where se.kind = 'waste' and se.reason = 'hong')     as w_hong,
      sum(se.qty) filter (where se.kind = 'waste' and se.reason = 'do_bo')    as w_do_bo,
      sum(se.qty) filter (where se.kind = 'waste' and se.reason = 'com_nhan_vien') as w_com,
      sum(se.qty) filter (where se.kind = 'waste' and se.reason = 'khac')     as w_khac,
      sum(se.qty) filter (where se.kind = 'count_adjust')                     as adjust,
      bool_or(se.kind = 'count_adjust')                                       as counted
    from public.stock_entries se
    where se.tenant_id = p_tenant and se.business_date = p_date
    group by se.ingredient_id
  ),
  shortfall as (
    select pb.ingredient_id, sum(pb.expected_qty - pb.actual_qty) as qty
    from public.production_batches pb
    where pb.tenant_id = p_tenant and pb.business_date = p_date
    group by pb.ingredient_id
  ),
  usage as (
    select u.* from win, public.inventory_usage(p_tenant, greatest(win.day_start, win.first_at), win.day_end) u
    where win.first_at is not null
  )
  select i.id,
    coalesce(op.qty, 0),
    coalesce(lg.receipts, 0),
    coalesce(lg.batch_in, 0),
    coalesce(-lg.batch_out, 0),
    coalesce(-lg.w_hong, 0),
    coalesce(-lg.w_do_bo, 0),
    coalesce(-lg.w_com, 0),
    coalesce(-lg.w_khac, 0),
    coalesce(lg.adjust, 0),
    coalesce(lg.counted, false),
    coalesce(us.order_usage, 0),
    coalesce(us.cancel_usage, 0),
    coalesce(sf.qty, 0),
    round(
      coalesce(op.qty, 0) + coalesce(lg.receipts, 0) + coalesce(lg.batch_in, 0) + coalesce(lg.batch_out, 0)
      + coalesce(lg.w_hong, 0) + coalesce(lg.w_do_bo, 0) + coalesce(lg.w_com, 0) + coalesce(lg.w_khac, 0)
      + coalesce(lg.adjust, 0) - coalesce(us.order_usage, 0),
      3)
  from public.ingredients i
  left join opening   op on op.ingredient_id = i.id
  left join ledger    lg on lg.ingredient_id = i.id
  left join usage     us on us.ingredient_id = i.id
  left join shortfall sf on sf.ingredient_id = i.id
  where i.tenant_id = p_tenant
    and (op.ingredient_id is not null or lg.ingredient_id is not null
         or us.ingredient_id is not null or sf.ingredient_id is not null);
$$;

revoke all on function public.inventory_day(uuid, date) from public, anon;
grant execute on function public.inventory_day(uuid, date) to authenticated;
