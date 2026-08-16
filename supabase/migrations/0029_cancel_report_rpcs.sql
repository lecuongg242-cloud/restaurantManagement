-- 0029_cancel_report_rpcs.sql — Tổng hợp món bị hủy (REPORT-10).
--
-- Cùng khuôn 0023: SUM/GROUP BY nằm trong Postgres vì PostgREST cắt 1000 dòng/request, cộng
-- trong JS sẽ báo thiếu ở tenant đông khách. `security invoker` ⇒ RLS tenant vẫn áp dụng.
--
-- KHÔNG lọc `channel`: đây là chỗ DUY NHẤT xem lại được đơn dine-in bị hủy (lịch sử POS chỉ có
-- takeaway, và phiên bàn đóng là mất dấu).
--
-- `left join memberships`: `order_items.cancelled_by` không có FK, dữ liệu cũ có thể trỏ tới
-- membership đã xóa. `inner join` sẽ NUỐT MẤT chính những lượt hủy đáng ngờ nhất.

-- ---- 1. Tổng quan -----------------------------------------------------------
create or replace function public.report_cancel_summary(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (cancelled_qty bigint, cancelled_amount bigint, ordered_qty bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce((select sum(oi.qty)
                from public.order_items oi
               where oi.tenant_id = p_tenant
                 and oi.status = 'cancelled'
                 and oi.cancelled_at >= p_from
                 and oi.cancelled_at <  p_to), 0)::bigint,
    coalesce((select sum(oi.unit_price_snapshot::bigint * oi.qty)
                from public.order_items oi
               where oi.tenant_id = p_tenant
                 and oi.status = 'cancelled'
                 and oi.cancelled_at >= p_from
                 and oi.cancelled_at <  p_to), 0)::bigint,
    -- Mẫu số của tỷ lệ hủy = số món ĐÃ GỌI trong kỳ (gồm cả món sau đó bị hủy) ⇒ lọc theo
    -- created_at, không phải cancelled_at.
    coalesce((select sum(oi.qty)
                from public.order_items oi
               where oi.tenant_id = p_tenant
                 and oi.created_at >= p_from
                 and oi.created_at <  p_to), 0)::bigint;
$$;

-- ---- 2. Theo người duyệt hủy -------------------------------------------------
create or replace function public.report_cancel_by_actor(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (membership_id uuid, display_name text, role text, cnt bigint, qty bigint, amount bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.cancelled_by,
    coalesce(m.display_name, '—'),
    coalesce(m.role, ''),
    count(*)::bigint,
    sum(oi.qty)::bigint,
    sum(oi.unit_price_snapshot::bigint * oi.qty)::bigint
  from public.order_items oi
  left join public.memberships m
    on m.id = oi.cancelled_by and m.tenant_id = p_tenant
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  group by oi.cancelled_by, m.display_name, m.role
  order by sum(oi.unit_price_snapshot::bigint * oi.qty) desc;
$$;

-- ---- 3. Món bị hủy nhiều nhất ------------------------------------------------
create or replace function public.report_cancel_top_items(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_limit  int default 10
)
returns table (name text, qty bigint, amount bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.name_snapshot,
    sum(oi.qty)::bigint,
    sum(oi.unit_price_snapshot::bigint * oi.qty)::bigint
  from public.order_items oi
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  group by oi.name_snapshot
  order by sum(oi.qty) desc, sum(oi.unit_price_snapshot::bigint * oi.qty) desc
  limit greatest(p_limit, 1);
$$;

-- ---- 4. Danh sách chi tiết ---------------------------------------------------
create or replace function public.report_cancel_list(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_limit  int default 20,
  p_offset int default 0
)
returns table (
  cancelled_at timestamptz,
  place        text,
  item_name    text,
  qty          int,
  amount       bigint,
  reason       text,
  actor_name   text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.cancelled_at,
    coalesce(
      case when t.name is not null then 'Bàn ' || t.name end,
      case when o.kitchen_no is not null then 'Đơn #' || o.kitchen_no end,
      '—'
    ),
    oi.name_snapshot,
    oi.qty,
    (oi.unit_price_snapshot::bigint * oi.qty)::bigint,
    -- Hủy cả đơn chỉ ghi lý do ở `orders`; hủy lẻ ghi ở `order_items`. Lấy cái nào có.
    coalesce(nullif(oi.cancel_reason, ''), nullif(o.cancel_reason, ''), '—'),
    coalesce(m.display_name, '—')
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.table_sessions ts on ts.id = o.table_session_id
  left join public.tables t on t.id = ts.table_id
  left join public.memberships m on m.id = oi.cancelled_by and m.tenant_id = p_tenant
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  order by oi.cancelled_at desc, oi.id desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
