-- 0079_report_pnl.sql — Báo cáo Kết quả kinh doanh (P20 / plan 20-04, REPORT-20, QD-027 D12, C5, C9).
--
-- CHỈ CHỦ QUÁN (C5): lộ tiền thuê nhà, lương, lợi nhuận. RLS của phiếu thu/chi cho quản lý đọc (sổ quỹ) nên hai hàm dưới
-- tự lọc qua owner_tenants — quản lý gọi thẳng RPC nhận 0 dòng.
--
-- Doanh thu cùng mốc KPI "Doanh thu" (BILL-05): bills_revenue.business_at, bill paid không phải vỏ chia. Đã đo trên DB thật
-- (08/2026, qt-food 3.009 HĐ, pho-viet 294 HĐ): Σ(subtotal − discount + phí phục vụ + VAT) = Σ total, lệch 0đ.
-- Giá vốn món (chế độ định lượng) tính ở TS bằng đúng đường REPORT-13 — không chép công thức lãi gộp vào đây.

-- Chi nhánh trong p_tenants mà người đăng nhập là CHỦ đang hoạt động (và chi nhánh còn dùng được). Như manager_tenants (0068).
create or replace function public.owner_tenants(p_tenants uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.tenant_id), '{}')
  from public.memberships m
  where m.user_id = auth.uid() and m.active and m.role = 'owner'
    and m.tenant_id = any (p_tenants)
    and m.tenant_id in (select public.auth_tenant_ids())
$$;
revoke execute on function public.owner_tenants(uuid[]) from public, anon;
grant execute on function public.owner_tenants(uuid[]) to authenticated;

-- Một dòng mỗi chi nhánh (người gọi là chủ). purchase_cost = Σ "Cần trả NCC" phiếu đã nhập theo NGÀY CHỨNG TỪ trong kỳ
-- (dùng khi quán không khai định lượng). has_recipes = quán có định lượng ⇒ giá vốn lấy theo REPORT-13.
create or replace function public.report_pnl(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (
  tenant_id uuid, gross_sales bigint, discount bigint, service_charge bigint, vat bigint, kpi_revenue bigint,
  bill_count bigint, purchase_cost bigint, purchase_count bigint, other_income bigint, has_recipes boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select unnest(public.owner_tenants(p_tenants)) as id
  ), b as (
    select br.tenant_id,
           sum(br.subtotal)::bigint as gross_sales, sum(br.discount_amount)::bigint as discount,
           sum(br.service_charge_amount)::bigint as service_charge, sum(br.vat_amount)::bigint as vat,
           sum(br.total)::bigint as kpi_revenue, count(*)::bigint as bill_count
    from public.bills_revenue br
    join t on t.id = br.tenant_id
    where br.status = 'paid' and br.split_count is null and br.business_at >= p_from and br.business_at < p_to
    group by 1
  ), pr as (
    select r.tenant_id, sum(r.total)::bigint as purchase_cost, count(*)::bigint as purchase_count
    from public.purchase_receipts r
    join t on t.id = r.tenant_id
    where r.status = 'done'
      and r.doc_date >= (p_from at time zone 'Asia/Ho_Chi_Minh')::date
      and r.doc_date < (p_to at time zone 'Asia/Ho_Chi_Minh')::date
    group by 1
  ), oi as (
    select v.tenant_id, sum(v.amount)::bigint as other_income
    from public.cash_vouchers v
    join t on t.id = v.tenant_id
    where v.status = 'active' and v.direction = 'in' and v.in_pnl and v.source = 'manual'
      and v.occurred_at >= p_from and v.occurred_at < p_to
    group by 1
  )
  select t.id,
         coalesce(b.gross_sales, 0), coalesce(b.discount, 0), coalesce(b.service_charge, 0), coalesce(b.vat, 0),
         coalesce(b.kpi_revenue, 0), coalesce(b.bill_count, 0),
         coalesce(pr.purchase_cost, 0), coalesce(pr.purchase_count, 0), coalesce(oi.other_income, 0),
         exists (select 1 from public.recipe_lines rl where rl.tenant_id = t.id)
  from t
  left join b on b.tenant_id = t.id
  left join pr on pr.tenant_id = t.id
  left join oi on oi.tenant_id = t.id
$$;
revoke execute on function public.report_pnl(uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.report_pnl(uuid[], timestamptz, timestamptz) to authenticated;

-- Chi phí = phiếu chi tay còn hiệu lực, có "Hạch toán" (QD-027 D12). Trả tiền phiếu nhập / trả nợ NCC / số dư đầu kỳ KHÔNG
-- phải chi phí (giá vốn đã tính qua nhập / xuất kho). Gom theo loại.
create or replace function public.report_pnl_expenses(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (tenant_id uuid, category_id uuid, name text, cost_group text, amount bigint, voucher_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select v.tenant_id, c.id, coalesce(c.name, 'Chi khác'), coalesce(c.cost_group, 'e'), sum(v.amount)::bigint, count(*)::bigint
  from public.cash_vouchers v
  left join public.cash_categories c on c.id = v.category_id
  where v.tenant_id = any (public.owner_tenants(p_tenants))
    and v.status = 'active' and v.direction = 'out' and v.in_pnl and v.source = 'manual'
    and v.occurred_at >= p_from and v.occurred_at < p_to
  group by 1, 2, 3, 4
$$;
revoke execute on function public.report_pnl_expenses(uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.report_pnl_expenses(uuid[], timestamptz, timestamptz) to authenticated;
