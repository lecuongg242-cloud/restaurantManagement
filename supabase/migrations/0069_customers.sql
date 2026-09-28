-- 0069_customers.sql — Danh sách khách hàng (P16 / plan 16-05, CUST-02, CUST-03).
--
-- Không có bảng khách tổng hợp: tính mỗi lần mở từ dữ liệu gốc, gom theo SĐT đã chuẩn hóa (0056). Khách của một hóa
-- đơn (00-TongQuan §Quy ước): đơn online/mang về = liên hệ của ĐƠN GỐC (bills.online_order_id); tại bàn = liên hệ của
-- đơn ĐẦU TIÊN có SĐT trong phiên (hoặc trong chính các món của hóa đơn). Một hóa đơn chỉ quy cho MỘT SĐT — không nhân
-- đôi tiền. Khách chỉ đặt bàn (chưa có hóa đơn) cũng có dòng.
--
-- Dữ liệu cá nhân: chỉ CHỦ / QUẢN LÝ (manager_tenants, 0068). Ghi chú khách: bảng customer_notes, RLS như bảng tenant +
-- chỉ chủ / quản lý.

create table if not exists public.customer_notes (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  phone      text not null check (phone ~ '^0\d{8,10}$'),
  note       text not null check (char_length(note) <= 500),
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, phone)
);
alter table public.customer_notes enable row level security;

drop policy if exists customer_notes_manager on public.customer_notes;
create policy customer_notes_manager on public.customer_notes
  for all
  using (tenant_id = any (public.manager_tenants(array[tenant_id])))
  with check (tenant_id = any (public.manager_tenants(array[tenant_id])));
revoke all on public.customer_notes from anon;

-- Hóa đơn đã trả (không vỏ chia) → SĐT khách + tên + kênh theo quy ước trên. Nội bộ cho hai RPC dưới.
create or replace function public.customer_bills(p_tenants uuid[])
returns table (tenant_id uuid, bill_id uuid, visit_key text, phone text, name text, channel text, total integer, at timestamptz)
language sql
stable
set search_path = public
as $$
  select b.tenant_id, b.id,
         coalesce(b.table_session_id::text, b.split_parent_id::text, b.online_order_id::text, b.id::text),
         c.phone, c.name, c.channel, b.total, b.business_at
  from public.bills_revenue b
  cross join lateral (
    select o.customer_contact ->> 'phone' as phone, nullif(btrim(o.customer_contact ->> 'name'), '') as name, o.channel
    from public.orders o
    where o.tenant_id = b.tenant_id
      and coalesce(o.customer_contact ->> 'phone', '') <> ''
      and (
        o.id = b.online_order_id
        or (b.table_session_id is not null and o.table_session_id = b.table_session_id)
        or o.id in (
          select oi.order_id from public.bill_items bi join public.order_items oi on oi.id = bi.order_item_id
          where bi.bill_id in (b.id, b.split_parent_id)
        )
      )
    order by (o.id = b.online_order_id) desc, o.created_at
    limit 1
  ) c
  where b.tenant_id = any (p_tenants) and b.status = 'paid' and b.split_count is null
$$;
revoke execute on function public.customer_bills(uuid[]) from public, anon, authenticated;

-- Danh sách khách. p_sort: 'spent' (chi nhiều) | 'visits' (đến nhiều) | 'recent' (gần nhất). p_limit kẹp [1, 100].
-- Chuỗi (P15): truyền mảng chi nhánh ⇒ khách đến nhiều chi nhánh gộp một dòng.
create or replace function public.customer_list(
  p_tenants uuid[],
  p_search text default null,
  p_sort text default 'spent',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  phone text, last_name text, visits bigint, total_spent bigint, first_seen timestamptz, last_seen timestamptz,
  top_channel text, reservations bigint, note text, total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select unnest(public.manager_tenants(p_tenants)) as id),
  hd as (select * from public.customer_bills(array(select id from t))),
  db as (
    select r.tenant_id, r.customer_phone as phone, nullif(btrim(r.customer_name), '') as name, r.reserved_at as at
    from public.reservations r
    where r.tenant_id in (select id from t) and r.customer_phone ~ '^0\d{8,10}$'
  ),
  gop as (
    select p.phone,
           (array_agg(p.name order by p.at desc) filter (where p.name is not null))[1] as last_name,
           count(distinct p.visit_key) filter (where p.src = 'hd') as visits,
           coalesce(sum(p.total) filter (where p.src = 'hd'), 0) as total_spent,
           min(p.at) as first_seen, max(p.at) as last_seen,
           mode() within group (order by p.channel) filter (where p.src = 'hd') as top_channel,
           count(*) filter (where p.src = 'db') as reservations
    from (
      select phone, name, visit_key, total, at, channel, 'hd' as src from hd
      union all
      select phone, name, null, null, at, null, 'db' from db
    ) p
    group by p.phone
  ),
  loc as (
    select g.* from gop g
    where p_search is null or btrim(p_search) = ''
       or g.phone like '%' || regexp_replace(p_search, '\D', '', 'g') || '%' and regexp_replace(p_search, '\D', '', 'g') <> ''
       or g.last_name ilike '%' || btrim(p_search) || '%'
  )
  select l.phone, l.last_name, l.visits::bigint, l.total_spent::bigint, l.first_seen, l.last_seen, l.top_channel,
         l.reservations::bigint,
         (select string_agg(n.note, ' · ') from public.customer_notes n where n.phone = l.phone and n.tenant_id in (select id from t)),
         count(*) over ()::bigint
  from loc l
  order by
    case when p_sort = 'visits' then l.visits end desc nulls last,
    case when p_sort = 'recent' then l.last_seen end desc nulls last,
    l.total_spent desc, l.last_seen desc
  limit greatest(1, least(coalesce(p_limit, 50), 100)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- Lịch sử một khách: hóa đơn + đặt bàn (mới nhất trước).
create or replace function public.customer_history(p_tenants uuid[], p_phone text)
returns table (kind text, tenant_id uuid, ref_id uuid, bill_no integer, at timestamptz, amount integer, channel text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select unnest(public.manager_tenants(p_tenants)) as id)
  select 'bill', h.tenant_id, h.bill_id, b.bill_no, h.at, h.total, h.channel, b.table_label
  from public.customer_bills(array(select id from t)) h
  join public.bills b on b.id = h.bill_id
  where h.phone = p_phone
  union all
  select 'reservation', r.tenant_id, r.id, null, r.reserved_at, null, null, r.party_size || ' khách · ' || r.status
  from public.reservations r
  where r.tenant_id in (select id from t) and r.customer_phone = p_phone
  order by 5 desc
  limit 200
$$;

-- Tổng doanh thu kỳ có SĐT / không SĐT — cho dòng "x% doanh thu có SĐT khách".
create or replace function public.customer_coverage(p_tenants uuid[], p_from timestamptz, p_to timestamptz)
returns table (revenue_with_phone bigint, revenue_total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with t as (select unnest(public.manager_tenants(p_tenants)) as id)
  select
    coalesce((select sum(h.total) from public.customer_bills(array(select id from t)) h where h.at >= p_from and h.at < p_to), 0)::bigint,
    coalesce((select sum(b.total) from public.bills_revenue b where b.tenant_id in (select id from t) and b.status = 'paid'
                and b.split_count is null and b.business_at >= p_from and b.business_at < p_to), 0)::bigint
$$;

revoke execute on function public.customer_list(uuid[], text, text, integer, integer) from public, anon;
revoke execute on function public.customer_history(uuid[], text) from public, anon;
revoke execute on function public.customer_coverage(uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.customer_list(uuid[], text, text, integer, integer) to authenticated;
grant execute on function public.customer_history(uuid[], text) to authenticated;
grant execute on function public.customer_coverage(uuid[], timestamptz, timestamptz) to authenticated;

-- Index hẹn từ 16-01: đơn có SĐT khách (chỉ vài phần trăm đơn — partial index nhỏ), và đặt bàn theo SĐT.
create index if not exists idx_orders_tenant_phone on public.orders (tenant_id, (customer_contact ->> 'phone'))
  where coalesce(customer_contact ->> 'phone', '') <> '';
create index if not exists idx_reservations_tenant_phone on public.reservations (tenant_id, customer_phone);
