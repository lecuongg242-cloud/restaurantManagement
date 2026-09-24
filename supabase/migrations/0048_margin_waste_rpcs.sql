-- 0048_margin_waste_rpcs.sql — Lãi gộp theo món + hao hụt (REPORT-13, REPORT-14, QD-017 D8/D9). 10-04.
--
-- Khuôn 0023/0037: language sql, stable, security invoker (RLS tenant vẫn áp), lọc p_tenant tường
-- minh, khoảng nửa mở [p_from, p_to), revoke khỏi public/anon.
--
-- DOANH THU THUẦN CỦA MÓN: bill_items.amount là GIÁ NIÊM YẾT × SL, chưa trừ giảm giá (giảm giá ở cấp
-- bill). Phân bổ theo tỷ lệ tiền, floor từng dòng, phần dư dồn vào dòng tiền lớn nhất (bằng nhau thì
-- id nhỏ hơn) → Σ đúng bằng subtotal − discount_amount. Cùng phép với lib/billing/net-revenue.ts.
--
-- GIÁ VỐN: theo ngày VN của paid_at, đọc từ bản chốt sổ (daily_closes). Ngày chưa chốt (hôm nay) →
-- vào uncosted_qty ở đây; server tính "tạm tính" riêng qua report_margin_open_lines.

-- Dòng bán có doanh thu thuần + ngày, dùng chung cho hai hàm dưới.
create or replace function public.report_margin_lines(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  bill_item_id   uuid,
  order_item_id  uuid,
  menu_item_id   uuid,
  name           text,
  qty            int,
  net_revenue    bigint,
  sold_date      date
)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select bi.id, bi.bill_id, bi.amount, bi.qty_allocated, oi.id as order_item_id, oi.menu_item_id,
           oi.name_snapshot, b.subtotal, b.discount_amount,
           (b.paid_at at time zone 'Asia/Ho_Chi_Minh')::date as d
    from public.bill_items bi
    join public.bills b        on b.id = bi.bill_id
    join public.order_items oi on oi.id = bi.order_item_id
    where bi.tenant_id = p_tenant
      and b.status = 'paid'
      and b.paid_at >= p_from
      and b.paid_at <  p_to
  ),
  a as (
    select l.*,
      case when l.subtotal > 0
           then floor(l.amount::numeric * (l.subtotal - l.discount_amount) / l.subtotal)::bigint
           else 0 end as base_net,
      row_number() over (partition by l.bill_id order by l.amount desc, l.id) as rn
    from l
  ),
  r as (
    select a.bill_id, max(a.subtotal - a.discount_amount) - sum(a.base_net) as resid
    from a group by a.bill_id
  )
  select a.id, a.order_item_id, a.menu_item_id, a.name_snapshot, a.qty_allocated,
         a.base_net + case when a.rn = 1 and a.subtotal > 0 then r.resid else 0 end,
         a.d
  from a join r on r.bill_id = a.bill_id;
$$;

create or replace function public.report_gross_margin(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  menu_item_id  uuid,
  name          text,
  qty           bigint,
  net_revenue   bigint,
  cost_total    numeric,
  costed_qty    bigint,
  uncosted_qty  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with ln as (
    select * from public.report_margin_lines(p_tenant, p_from, p_to)
  ),
  closes as (
    select dc.business_date, dc.payload
    from public.daily_closes dc
    where dc.tenant_id = p_tenant
      and dc.business_date in (select distinct sold_date from ln)
  ),
  item_cost as (
    select c.business_date, (x ->> 'menu_item_id')::uuid as menu_item_id,
           (x ->> 'portion_cost')::numeric as cost
    from closes c, jsonb_array_elements(c.payload -> 'items') x
  ),
  opt_cost as (
    select c.business_date, (x ->> 'modifier_option_id')::uuid as option_id,
           (x ->> 'cost')::numeric as cost,
           (x ->> 'cost') is null as missing
    from closes c, jsonb_array_elements(c.payload -> 'options') x
  ),
  line_opts as (
    -- Option không có định lượng không có mặt trong bản chốt → đóng góp 0 (không trừ gì).
    select ln.bill_item_id,
           coalesce(sum(oc.cost), 0) as cost,
           bool_or(oc.missing)       as missing
    from ln
    join public.order_item_modifiers m on m.order_item_id = ln.order_item_id
    join opt_cost oc on oc.option_id = m.option_id and oc.business_date = ln.sold_date
    group by ln.bill_item_id
  ),
  costed as (
    select ln.*,
      case
        when ic.cost is null or coalesce(lo.missing, false) then null
        else (ic.cost + coalesce(lo.cost, 0)) * ln.qty
      end as line_cost
    from ln
    left join item_cost ic on ic.menu_item_id = ln.menu_item_id and ic.business_date = ln.sold_date
    left join line_opts lo on lo.bill_item_id = ln.bill_item_id
  )
  select c.menu_item_id,
         coalesce(max(mi.name), max(c.name), '—'),
         sum(c.qty)::bigint,
         sum(c.net_revenue)::bigint,
         round(coalesce(sum(c.line_cost), 0), 2),
         coalesce(sum(c.qty) filter (where c.line_cost is not null), 0)::bigint,
         coalesce(sum(c.qty) filter (where c.line_cost is null), 0)::bigint
  from costed c
  left join public.menu_items mi on mi.id = c.menu_item_id
  group by c.menu_item_id, case when c.menu_item_id is null then c.name end;
$$;

-- Dòng bán rơi vào NGÀY CHƯA CHỐT (thường chỉ hôm nay) — server tính giá vốn "tạm tính".
create or replace function public.report_margin_open_lines(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_day    date
)
returns table (menu_item_id uuid, qty int, option_ids uuid[])
language sql
stable
security invoker
set search_path = public
as $$
  select ln.menu_item_id, ln.qty,
         coalesce(array_agg(m.option_id) filter (where m.option_id is not null), '{}')
  from public.report_margin_lines(p_tenant, p_from, p_to) ln
  left join public.order_item_modifiers m on m.order_item_id = ln.order_item_id
  where ln.sold_date = p_day
    and not exists (
      select 1 from public.daily_closes dc where dc.tenant_id = p_tenant and dc.business_date = p_day
    )
  group by ln.bill_item_id, ln.menu_item_id, ln.qty;
$$;

-- Dòng nối về KPI: Doanh thu (bills.total, loại vỏ chia đều) = món thuần + phí phục vụ + VAT.
-- Món/phí/VAT đọc trên bill MANG bill_items (vỏ chia đều mang món + phí + VAT; bill con chỉ mang
-- total/N) — lệch còn lại là làm tròn khi chia hoặc vỏ/con thanh toán lệch kỳ, hiện ra, không giấu.
create or replace function public.report_margin_reconcile(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (net_item_revenue bigint, service_charge bigint, vat bigint, kpi_revenue bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with with_items as (
    select b.subtotal, b.discount_amount, b.service_charge_amount, b.vat_amount
    from public.bills b
    where b.tenant_id = p_tenant
      and b.status = 'paid'
      and b.paid_at >= p_from
      and b.paid_at <  p_to
      and exists (select 1 from public.bill_items bi where bi.bill_id = b.id)
  )
  select
    coalesce((select sum(subtotal - discount_amount) from with_items), 0)::bigint,
    coalesce((select sum(service_charge_amount) from with_items), 0)::bigint,
    coalesce((select sum(vat_amount) from with_items), 0)::bigint,
    coalesce((
      select sum(b.total) from public.bills b
      where b.tenant_id = p_tenant and b.status = 'paid' and b.split_count is null
        and b.paid_at >= p_from and b.paid_at < p_to
    ), 0)::bigint;
$$;

-- Hao hụt: từng ngày × nguyên liệu, đọc từ bản chốt. Kỳ báo cáo [p_from, p_to) đổi ra ngày VN.
create or replace function public.report_waste(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  business_date    date,
  ingredient_id    uuid,
  name             text,
  unit_cost        numeric,
  counted          boolean,
  cancel_usage     numeric,
  batch_shortfall  numeric,
  waste_hong       numeric,
  waste_do_bo      numeric,
  waste_com_nv     numeric,
  waste_khac       numeric,
  adjust           numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select dc.business_date,
         (x ->> 'id')::uuid,
         x ->> 'name',
         (x ->> 'unit_cost')::numeric,
         coalesce((x ->> 'counted')::boolean, false),
         coalesce((x ->> 'cancel_usage')::numeric, 0),
         coalesce((x ->> 'batch_shortfall')::numeric, 0),
         coalesce((x ->> 'waste_hong')::numeric, 0),
         coalesce((x ->> 'waste_do_bo')::numeric, 0),
         coalesce((x ->> 'waste_com_nv')::numeric, 0),
         coalesce((x ->> 'waste_khac')::numeric, 0),
         coalesce((x ->> 'adjust')::numeric, 0)
  from public.daily_closes dc, jsonb_array_elements(dc.payload -> 'ingredients') x
  where dc.tenant_id = p_tenant
    and dc.business_date >= (p_from at time zone 'Asia/Ho_Chi_Minh')::date
    and dc.business_date <  (p_to   at time zone 'Asia/Ho_Chi_Minh')::date
  order by dc.business_date;
$$;

revoke all on function public.report_margin_lines(uuid, timestamptz, timestamptz)            from public, anon;
revoke all on function public.report_gross_margin(uuid, timestamptz, timestamptz)            from public, anon;
revoke all on function public.report_margin_open_lines(uuid, timestamptz, timestamptz, date) from public, anon;
revoke all on function public.report_margin_reconcile(uuid, timestamptz, timestamptz)        from public, anon;
revoke all on function public.report_waste(uuid, timestamptz, timestamptz)                   from public, anon;
grant execute on function public.report_margin_lines(uuid, timestamptz, timestamptz)            to authenticated;
grant execute on function public.report_gross_margin(uuid, timestamptz, timestamptz)            to authenticated;
grant execute on function public.report_margin_open_lines(uuid, timestamptz, timestamptz, date) to authenticated;
grant execute on function public.report_margin_reconcile(uuid, timestamptz, timestamptz)        to authenticated;
grant execute on function public.report_waste(uuid, timestamptz, timestamptz)                   to authenticated;
