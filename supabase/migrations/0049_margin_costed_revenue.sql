-- 0049_margin_costed_revenue.sql — Doanh thu CỦA PHẦN ĐÃ CÓ GIÁ VỐN (REPORT-13). 10-04.
--
-- Lãi gộp chỉ được tính trên dòng đã có giá vốn (QD-017 D6: thiếu giá thì loại khỏi tổng, không
-- đoán). Một món có thể vừa có dòng có giá vốn vừa có dòng chưa (ngày trước khi quán bật tính năng,
-- hôm nay chưa chốt). Chia doanh thu theo tỷ lệ số phần là SAI: mỗi dòng mang giảm giá khác nhau.
-- Nên trả thẳng doanh thu của các dòng có giá vốn; dòng hôm nay trả kèm doanh thu để server cộng
-- phần "tạm tính".
--
-- Đổi danh sách cột trả về ⇒ phải drop rồi create (cả migration một transaction, không có khoảng
-- trống hàm biến mất). Drop cũng xóa grant ⇒ cấp lại ở cuối (bài học 0036/0037).

drop function if exists public.report_gross_margin(uuid, timestamptz, timestamptz);
create function public.report_gross_margin(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  menu_item_id    uuid,
  name            text,
  qty             bigint,
  net_revenue     bigint,
  costed_revenue  bigint,
  cost_total      numeric,
  costed_qty      bigint,
  uncosted_qty    bigint
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
         coalesce(sum(c.net_revenue) filter (where c.line_cost is not null), 0)::bigint,
         round(coalesce(sum(c.line_cost), 0), 2),
         coalesce(sum(c.qty) filter (where c.line_cost is not null), 0)::bigint,
         coalesce(sum(c.qty) filter (where c.line_cost is null), 0)::bigint
  from costed c
  left join public.menu_items mi on mi.id = c.menu_item_id
  group by c.menu_item_id, case when c.menu_item_id is null then c.name end;
$$;

drop function if exists public.report_margin_open_lines(uuid, timestamptz, timestamptz, date);
create function public.report_margin_open_lines(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_day    date
)
returns table (menu_item_id uuid, qty int, net_revenue bigint, option_ids uuid[])
language sql
stable
security invoker
set search_path = public
as $$
  select ln.menu_item_id, ln.qty, ln.net_revenue,
         coalesce(array_agg(m.option_id) filter (where m.option_id is not null), '{}')
  from public.report_margin_lines(p_tenant, p_from, p_to) ln
  left join public.order_item_modifiers m on m.order_item_id = ln.order_item_id
  where ln.sold_date = p_day
    and not exists (
      select 1 from public.daily_closes dc where dc.tenant_id = p_tenant and dc.business_date = p_day
    )
  group by ln.bill_item_id, ln.menu_item_id, ln.qty, ln.net_revenue;
$$;

revoke all on function public.report_gross_margin(uuid, timestamptz, timestamptz)            from public, anon;
revoke all on function public.report_margin_open_lines(uuid, timestamptz, timestamptz, date) from public, anon;
grant execute on function public.report_gross_margin(uuid, timestamptz, timestamptz)            to authenticated;
grant execute on function public.report_margin_open_lines(uuid, timestamptz, timestamptz, date) to authenticated;
