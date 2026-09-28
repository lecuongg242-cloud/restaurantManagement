-- 0068_report_staff_table.sql — Báo cáo sâu (P16 / plan 16-02, 16-03): theo nhân viên, theo bàn/khu, xu hướng nhóm
-- món, số phụ cho so sánh chi nhánh. Quy ước quy người / quy bàn: 30-KeHoach/P16/00-TongQuan.md §Quy ước.
--
-- Mọi hàm nhận MẢNG chi nhánh (như 0064) và `security invoker` ⇒ RLS lọc chi nhánh người xem không vào được.
-- Báo cáo theo nhân viên còn lọc thêm: chỉ chi nhánh người xem là CHỦ / QUẢN LÝ (`manager_tenants`) — thu ngân gọi
-- thẳng RPC nhận 0 dòng, không thấy số của đồng nghiệp.

-- Chi nhánh trong p_tenants mà người đang đăng nhập là chủ / quản lý đang hoạt động (và chi nhánh đang dùng được).
create or replace function public.manager_tenants(p_tenants uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.tenant_id), '{}')
  from public.memberships m
  where m.user_id = auth.uid() and m.active and m.role in ('owner', 'manager')
    and m.tenant_id = any (p_tenants)
    and m.tenant_id in (select public.auth_tenant_ids())
$$;
revoke execute on function public.manager_tenants(uuid[]) from public, anon;
grant execute on function public.manager_tenants(uuid[]) to authenticated;

-- ---- 16-02: theo nhân viên -------------------------------------------------------------------------------------
-- kind: 'staff' (một membership) | 'customer' (khách tự gọi QR / đặt online, không nhân viên nào nhận) | 'unknown'.
--  • Nhận đơn  = coalesce(orders.created_by, orders.confirmed_by); giá trị món = bill_items của bill đã trả (cùng quy
--    ước "món bán chạy": bill paid, theo business_at) — phân bổ theo bill_items nên đơn trong bill chia không nhân đôi.
--  • Thu tiền  = payments.received_by của hóa đơn trong kỳ (cùng quy ước report_payments) ⇒ Σ = báo cáo phương thức TT.
--  • Hủy món   = order_items.cancelled_by, theo cancelled_at (cùng quy ước report_cancel_by_actor).
--  • Giảm giá  = bills.discount_by, bill paid không phải vỏ chia, theo paid_at (cùng quy ước report_discount_by_actor).
create or replace function public.report_by_staff(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (
  kind text,
  membership_id uuid,
  display_name text,
  role text,
  active boolean,
  orders_taken bigint,
  items_taken bigint,
  revenue_taken bigint,
  bills_received bigint,
  amount_received bigint,
  amount_cash bigint,
  amount_transfer bigint,
  items_cancelled bigint,
  amount_cancelled bigint,
  discounts_approved bigint,
  amount_discounted bigint
)
language sql
stable
set search_path = public
as $$
  with t as (select unnest(public.manager_tenants(p_tenants)) as id),
  nhan as (
    select coalesce(o.created_by, o.confirmed_by) as mid,
           case when coalesce(o.created_by, o.confirmed_by) is not null then 'staff'
                when o.source in ('qr', 'online') then 'customer' else 'unknown' end as kind,
           count(distinct o.id) as orders_taken, sum(bi.qty_allocated) as items_taken, sum(bi.amount) as revenue_taken
    from public.bill_items bi
    join public.bills_revenue b on b.id = bi.bill_id
    join public.order_items oi on oi.id = bi.order_item_id
    join public.orders o on o.id = oi.order_id
    where bi.tenant_id in (select id from t) and b.status = 'paid'
      and b.business_at >= p_from and b.business_at < p_to
    group by 1, 2
  ),
  thu as (
    select p.received_by as mid, case when p.received_by is null then 'unknown' else 'staff' end as kind,
           count(distinct p.bill_id) as bills_received, sum(p.amount) as amount_received,
           sum(p.amount) filter (where p.method = 'cash') as amount_cash,
           sum(p.amount) filter (where p.method = 'transfer') as amount_transfer
    from public.payments p
    join public.bills_revenue b on b.id = p.bill_id
    where p.tenant_id in (select id from t) and b.business_at >= p_from and b.business_at < p_to
    group by 1, 2
  ),
  huy as (
    select oi.cancelled_by as mid, case when oi.cancelled_by is null then 'unknown' else 'staff' end as kind,
           sum(oi.qty) as items_cancelled, sum(oi.unit_price_snapshot::bigint * oi.qty) as amount_cancelled
    from public.order_items oi
    where oi.tenant_id in (select id from t) and oi.status = 'cancelled'
      and oi.cancelled_at >= p_from and oi.cancelled_at < p_to
    group by 1, 2
  ),
  giam as (
    select b.discount_by as mid, case when b.discount_by is null then 'unknown' else 'staff' end as kind,
           count(*) as discounts_approved, sum(b.discount_amount) as amount_discounted
    from public.bills b
    where b.tenant_id in (select id from t) and b.status = 'paid' and b.split_count is null and b.discount_amount > 0
      and b.paid_at >= p_from and b.paid_at < p_to
    group by 1, 2
  ),
  khoa as (
    select kind, mid from nhan union select kind, mid from thu union select kind, mid from huy union select kind, mid from giam
  )
  select k.kind, k.mid,
         case when k.kind = 'customer' then 'Khách tự gọi'
              when k.mid is null then 'Không rõ'
              when m.id is null then 'Nhân viên đã xóa'
              else coalesce(m.display_name, m.email::text, '—') end,
         coalesce(m.role, ''),
         coalesce(m.active, false),
         coalesce(n.orders_taken, 0)::bigint, coalesce(n.items_taken, 0)::bigint, coalesce(n.revenue_taken, 0)::bigint,
         coalesce(th.bills_received, 0)::bigint, coalesce(th.amount_received, 0)::bigint,
         coalesce(th.amount_cash, 0)::bigint, coalesce(th.amount_transfer, 0)::bigint,
         coalesce(h.items_cancelled, 0)::bigint, coalesce(h.amount_cancelled, 0)::bigint,
         coalesce(g.discounts_approved, 0)::bigint, coalesce(g.amount_discounted, 0)::bigint
  from khoa k
  left join public.memberships m on m.id = k.mid
  left join nhan n on n.kind = k.kind and n.mid is not distinct from k.mid
  left join thu th on th.kind = k.kind and th.mid is not distinct from k.mid
  left join huy h on h.kind = k.kind and h.mid is not distinct from k.mid
  left join giam g on g.kind = k.kind and g.mid is not distinct from k.mid
  order by coalesce(th.amount_received, 0) + coalesce(n.revenue_taken, 0) desc
$$;

-- ---- 16-03: theo bàn / khu --------------------------------------------------------------------------------------
-- Mỗi bàn (tên + khu CHỤP lúc tạo bill, 0056 — bàn đã xóa vẫn đúng tên): số phiên, phút ngồi TB (phiên đã đóng),
-- doanh thu (BILL-05), doanh thu / phiên, doanh thu / giờ ngồi. Bill không gắn bàn → một dòng "Không gắn bàn" ⇒
-- Σ doanh thu = doanh thu kỳ.
create or replace function public.report_table_usage(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (
  area_name text,
  table_name text,
  sessions bigint,
  avg_minutes integer,
  revenue bigint,
  revenue_per_session bigint,
  revenue_per_hour bigint
)
language sql
stable
set search_path = public
as $$
  with b as (
    -- Tên bàn/khu chụp nằm ở bảng bills (0056); view bills_revenue có trước 0056 nên không có hai cột này.
    select coalesce(bb.area_label, case when bl.table_session_id is null then '' else 'Chưa xếp khu' end) as area_name,
           coalesce(bb.table_label, case when bl.table_session_id is null then 'Không gắn bàn' else 'Bàn đã xóa' end) as table_name,
           bl.table_session_id, bl.total
    from public.bills_revenue bl
    join public.bills bb on bb.id = bl.id
    where bl.tenant_id = any (p_tenants) and bl.status = 'paid' and bl.split_count is null
      and bl.business_at >= p_from and bl.business_at < p_to
  ),
  g as (
    select b.area_name, b.table_name, count(distinct b.table_session_id) as sessions, sum(b.total) as revenue,
           array_agg(distinct b.table_session_id) filter (where b.table_session_id is not null) as ss
    from b group by 1, 2
  )
  select g.area_name, g.table_name, g.sessions::bigint,
         (select round(avg(extract(epoch from ts.closed_at - ts.opened_at) / 60))::int
            from public.table_sessions ts where ts.id = any (g.ss) and ts.closed_at is not null),
         g.revenue::bigint,
         case when g.sessions > 0 then round(g.revenue::numeric / g.sessions)::bigint end,
         (select case when sum(extract(epoch from ts.closed_at - ts.opened_at)) > 0
                      then round(g.revenue / (sum(extract(epoch from ts.closed_at - ts.opened_at)) / 3600))::bigint end
            from public.table_sessions ts where ts.id = any (g.ss) and ts.closed_at is not null)
  from g
  order by g.revenue desc
$$;

-- ---- 16-03: xu hướng nhóm món -----------------------------------------------------------------------------------
-- Doanh thu + số lượng theo nhóm món theo từng kỳ (ngày / tuần bắt đầu thứ Hai / tháng — giờ VN). Nhóm theo tên CHỤP
-- lúc bán (0056), cùng quy ước khối "Cơ cấu theo nhóm món".
create or replace function public.report_category_trend(p_tenants uuid[], p_from timestamptz, p_to timestamptz, p_bucket text default 'week')
returns table (bucket_start timestamptz, name text, qty bigint, revenue bigint)
language sql
stable
set search_path = public
as $$
  select (date_trunc(case when p_bucket in ('day', 'week', 'month') then p_bucket else 'week' end,
                     b.business_at at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'),
         coalesce(oi.category_name, mc.name, 'Khác'), sum(bi.qty_allocated)::bigint, sum(bi.amount)::bigint
  from public.bill_items bi
  join public.bills_revenue b on b.id = bi.bill_id
  join public.order_items oi on oi.id = bi.order_item_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.menu_categories mc on mc.id = mi.category_id
  where bi.tenant_id = any (p_tenants) and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by 1, 2
  order by 1, 4 desc
$$;

-- ---- 16-03: số phụ cho bảng so sánh chi nhánh --------------------------------------------------------------------
-- Bổ sung cho report_by_branch (0064, giữ nguyên chữ ký): tiền giảm giá, tiền món hủy, số phiên bàn ⇒ tỷ lệ giảm giá,
-- tỷ lệ hủy, doanh thu / lượt bàn.
create or replace function public.report_branch_extra(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (tenant_id uuid, discount_amount bigint, cancelled_amount bigint, table_sessions bigint)
language sql
stable
set search_path = public
as $$
  select t.id,
         (select coalesce(sum(b.discount_amount), 0) from public.bills b
           where b.tenant_id = t.id and b.status = 'paid' and b.split_count is null
             and b.paid_at >= p_from and b.paid_at < p_to)::bigint,
         (select coalesce(sum(oi.unit_price_snapshot::bigint * oi.qty), 0) from public.order_items oi
           where oi.tenant_id = t.id and oi.status = 'cancelled' and oi.cancelled_at >= p_from and oi.cancelled_at < p_to)::bigint,
         (select count(distinct b.table_session_id) from public.bills_revenue b
           where b.tenant_id = t.id and b.status = 'paid' and b.split_count is null and b.table_session_id is not null
             and b.business_at >= p_from and b.business_at < p_to)::bigint
  from public.tenants t
  where t.id = any (p_tenants)
$$;

revoke execute on function public.report_by_staff(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_table_usage(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_category_trend(uuid[], timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.report_branch_extra(uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.report_by_staff(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.report_table_usage(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.report_category_trend(uuid[], timestamptz, timestamptz, text) to authenticated;
grant execute on function public.report_branch_extra(uuid[], timestamptz, timestamptz) to authenticated;
