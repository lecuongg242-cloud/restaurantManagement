-- 0064_report_multi.sql — Báo cáo gộp chuỗi (P15 / plan 15-04, QD-023 D5).
--
-- Bản MẢNG chi nhánh của các RPC báo cáo đang dùng. `security invoker` (như bản đơn) ⇒ RLS của bills/bill_items/
-- payments tự lọc còn các chi nhánh người xem có quyền: truyền id chi nhánh không thuộc về mình thì phần đó ra 0,
-- không lỗi.
--
-- CÙNG CÔNG THỨC với bản một quán (0023 / 0040 / 0056): hóa đơn `paid`, bỏ hóa đơn vỏ chứa của chia đều
-- (split_count is null) ở tổng/biểu đồ, khoảng nửa mở trên `business_at`, gom giờ theo giờ VN. Bản một quán GIỮ
-- NGUYÊN (qt-food đang bán) — test tests/rls/report-multi.test.ts so bản mảng [một quán] với bản đơn trên dữ liệu
-- thật để hai bản không lệch nhau.

create or replace function public.report_summary_multi(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (total_revenue bigint, bill_count bigint, avg_per_bill bigint)
language sql stable set search_path = public
as $$
  select coalesce(sum(b.total), 0)::bigint, count(*)::bigint, coalesce(round(avg(b.total)), 0)::bigint
  from public.bills_revenue b
  where b.tenant_id = any (p_tenants) and b.status = 'paid' and b.split_count is null
    and b.business_at >= p_from and b.business_at < p_to;
$$;

create or replace function public.report_series_multi(p_tenants uuid[], p_from timestamptz, p_to timestamptz, p_grain text default 'day')
returns table (bucket_start timestamptz, revenue bigint, bill_count bigint)
language sql stable set search_path = public
as $$
  select (date_trunc(case when p_grain in ('hour','day','week','month') then p_grain else 'day' end,
                     b.business_at at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'),
         coalesce(sum(b.total), 0)::bigint, count(*)::bigint
  from public.bills_revenue b
  where b.tenant_id = any (p_tenants) and b.status = 'paid' and b.split_count is null
    and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 1;
$$;

-- Món bán chạy: món cùng gốc ở các chi nhánh (menu_items.source_id, 0063) cộng CHUNG một dòng; món riêng chi
-- nhánh đứng riêng. Món đã xóa khỏi thực đơn gom theo tên chụp lúc bán.
create or replace function public.report_top_items_multi(p_tenants uuid[], p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (name text, qty bigint, revenue bigint)
language sql stable set search_path = public
as $$
  select max(coalesce(oi.name_snapshot, '—')), sum(bi.qty_allocated)::bigint, sum(bi.amount)::bigint
  from public.bill_items bi
  join public.bills_revenue b on b.id = bi.bill_id
  join public.order_items oi on oi.id = bi.order_item_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  where bi.tenant_id = any (p_tenants) and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by coalesce(mi.source_id::text, mi.id::text, 'ten:' || coalesce(oi.name_snapshot, '—'))
  order by 2 desc, 3 desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.report_by_category_multi(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (name text, qty bigint, revenue bigint)
language sql stable set search_path = public
as $$
  select coalesce(oi.category_name, mc.name, 'Khác'), sum(bi.qty_allocated)::bigint, sum(bi.amount)::bigint
  from public.bill_items bi
  join public.bills_revenue b on b.id = bi.bill_id
  join public.order_items oi on oi.id = bi.order_item_id
  left join public.menu_items mi on mi.id = oi.menu_item_id
  left join public.menu_categories mc on mc.id = mi.category_id
  where bi.tenant_id = any (p_tenants) and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 3 desc;
$$;

create or replace function public.report_payments_multi(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (method text, amount bigint, count bigint)
language sql stable set search_path = public
as $$
  select p.method, coalesce(sum(p.amount), 0)::bigint, count(*)::bigint
  from public.payments p
  join public.bills_revenue b on b.id = p.bill_id
  where p.tenant_id = any (p_tenants) and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 2 desc;
$$;

-- So sánh chi nhánh: doanh thu, số hóa đơn, TB/hóa đơn kỳ này và kỳ trước (cùng độ dài, liền trước). Mỗi chi
-- nhánh có trong mảng mà người xem có quyền đều có một dòng (0 nếu không bán). Dùng cho Tổng quan chuỗi (15-02)
-- và bảng so sánh (15-04) — một nguồn.
create or replace function public.report_by_branch(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (tenant_id uuid, revenue bigint, bill_count bigint, avg_per_bill bigint, prev_revenue bigint, prev_bill_count bigint)
language sql stable set search_path = public
as $$
  with ky as (
    select b.tenant_id,
           sum(b.total) filter (where b.business_at >= p_from) as rev,
           count(*) filter (where b.business_at >= p_from) as cnt,
           avg(b.total) filter (where b.business_at >= p_from) as tb,
           sum(b.total) filter (where b.business_at < p_from) as prev_rev,
           count(*) filter (where b.business_at < p_from) as prev_cnt
    from public.bills_revenue b
    where b.tenant_id = any (p_tenants) and b.status = 'paid' and b.split_count is null
      and b.business_at >= p_from - (p_to - p_from) and b.business_at < p_to
    group by b.tenant_id
  )
  select t.id, coalesce(k.rev, 0)::bigint, coalesce(k.cnt, 0)::bigint, coalesce(round(k.tb), 0)::bigint,
         coalesce(k.prev_rev, 0)::bigint, coalesce(k.prev_cnt, 0)::bigint
  from public.tenants t
  left join ky k on k.tenant_id = t.id
  where t.id = any (p_tenants)
  order by coalesce(k.rev, 0) desc;
$$;

revoke execute on function public.report_summary_multi(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_series_multi(uuid[], timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.report_top_items_multi(uuid[], timestamptz, timestamptz, integer) from public, anon;
revoke execute on function public.report_by_category_multi(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_payments_multi(uuid[], timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_by_branch(uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.report_summary_multi(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.report_series_multi(uuid[], timestamptz, timestamptz, text) to authenticated;
grant execute on function public.report_top_items_multi(uuid[], timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.report_by_category_multi(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.report_payments_multi(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.report_by_branch(uuid[], timestamptz, timestamptz) to authenticated;
