-- 0046_stock_ledger.sql — Sổ nhập / chế biến + tồn lý thuyết + số phần (INV-04..07, QD-017). 10-02.
--
-- ĐƠN HÀNG LÀ SỔ CÁI (D1): lượng dùng theo đơn được TÍNH từ order_items, không ghi phiếu trừ kho
-- lúc bán, không trigger trên order_items. Bảng dưới chỉ chứa những sự kiện KHÔNG có trong đơn
-- hàng: nhập, chế biến mẻ, xuất hủy, điều chỉnh kiểm kê (hai loại sau dùng ở 10-03, khai sẵn ở
-- đây để không phải đổi `check` lần hai).

create table if not exists public.production_batches (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  business_date  date not null,
  ingredient_id  uuid not null references public.ingredients (id) on delete restrict,
  batch_count    numeric(10, 3) not null check (batch_count > 0),
  expected_qty   numeric(14, 3) not null check (expected_qty >= 0),
  actual_qty     numeric(14, 3) not null check (actual_qty >= 0),
  cost_total     numeric(16, 2) check (cost_total is null or cost_total >= 0),
  unit_cost      numeric(16, 6) check (unit_cost is null or unit_cost >= 0),
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists idx_production_batches_tenant_date
  on public.production_batches (tenant_id, business_date);

create table if not exists public.stock_entries (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  business_date  date not null,
  ingredient_id  uuid not null references public.ingredients (id) on delete restrict,
  kind           text not null
                 check (kind in ('receipt', 'batch_in', 'batch_out', 'waste', 'count_adjust')),
  qty            numeric(14, 3) not null,   -- CÓ DẤU, đơn vị gốc: nhập/ra mẻ dương, dùng/hủy âm
  unit_cost      numeric(16, 6) check (unit_cost is null or unit_cost >= 0),
  batch_id       uuid references public.production_batches (id) on delete cascade,
  reason         text check (reason is null or reason in ('hong', 'do_bo', 'com_nhan_vien', 'khac')),
  note           text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint stock_entries_sign check (
    (kind in ('receipt', 'batch_in') and qty > 0)
    or (kind in ('batch_out', 'waste') and qty < 0)
    or kind = 'count_adjust'
  ),
  constraint stock_entries_waste_reason check ((kind = 'waste') = (reason is not null))
);
create index if not exists idx_stock_entries_tenant_created
  on public.stock_entries (tenant_id, created_at);
create index if not exists idx_stock_entries_tenant_date
  on public.stock_entries (tenant_id, business_date);

alter table public.production_batches enable row level security;
drop policy if exists production_batches_tenant_all on public.production_batches;
create policy production_batches_tenant_all on public.production_batches
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.stock_entries enable row level security;
drop policy if exists stock_entries_tenant_all on public.stock_entries;
create policy stock_entries_tenant_all on public.stock_entries
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

-- ---- Ghi phiếu chế biến: batch + batch_in + N batch_out trong MỘT giao dịch ----------------
-- Chết giữa chừng mà còn batch_in thiếu batch_out là tồn ảo. `security invoker`: RLS áp nguyên
-- vẹn — gọi với p_tenant của quán khác thì insert bị từ chối và cả hàm rollback.
create or replace function public.record_batch(
  p_tenant         uuid,
  p_business_date  date,
  p_ingredient     uuid,
  p_batch_count    numeric,
  p_expected       numeric,
  p_actual         numeric,
  p_cost_total     numeric,
  p_unit_cost      numeric,
  p_created_by     uuid,
  p_consume        jsonb    -- [{ "ingredient_id": uuid, "qty": numeric (dương, đơn vị gốc) }]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch uuid;
  v_bad   int;
begin
  -- Khóa ngoại bỏ qua RLS: không kiểm ở đây thì quán B trỏ được vào nguyên liệu của quán A.
  if not exists (
    select 1 from public.ingredients
    where id = p_ingredient and tenant_id = p_tenant and kind = 'prepared'
  ) then
    raise exception 'khong tim thay ban thanh pham' using errcode = '42501';
  end if;

  select count(*) into v_bad
  from jsonb_array_elements(p_consume) c
  where not exists (
    select 1 from public.ingredients i
    where i.id = (c ->> 'ingredient_id')::uuid and i.tenant_id = p_tenant
  );
  if v_bad > 0 then
    raise exception 'nguyen lieu con khong thuoc quan' using errcode = '42501';
  end if;

  insert into public.production_batches
    (tenant_id, business_date, ingredient_id, batch_count, expected_qty, actual_qty,
     cost_total, unit_cost, created_by)
  values
    (p_tenant, p_business_date, p_ingredient, p_batch_count, p_expected, p_actual,
     p_cost_total, p_unit_cost, p_created_by)
  returning id into v_batch;

  if p_actual > 0 then
    insert into public.stock_entries
      (tenant_id, business_date, ingredient_id, kind, qty, unit_cost, batch_id, created_by)
    values
      (p_tenant, p_business_date, p_ingredient, 'batch_in', p_actual, p_unit_cost, v_batch, p_created_by);
  end if;

  insert into public.stock_entries
    (tenant_id, business_date, ingredient_id, kind, qty, batch_id, created_by)
  select p_tenant, p_business_date, (c ->> 'ingredient_id')::uuid, 'batch_out',
         -((c ->> 'qty')::numeric), v_batch, p_created_by
  from jsonb_array_elements(p_consume) c
  where (c ->> 'qty')::numeric > 0;

  return v_batch;
end;
$$;

revoke all on function public.record_batch(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, uuid, jsonb)
  from public, anon;
grant execute on function public.record_batch(uuid, date, uuid, numeric, numeric, numeric, numeric, numeric, uuid, jsonb)
  to authenticated;

-- ---- Tồn lý thuyết -----------------------------------------------------------------------
-- Cộng dồn từ MỐC GỐC = dòng sổ đầu tiên của quán (10-03 đổi thành bản chốt sổ gần nhất). Đơn
-- trước mốc gốc KHÔNG tính: quán bật tính năng giữa tháng không bị trừ âm bởi đơn cũ.
--
-- Dùng theo đơn (QD-017 D2), xét ở MỨC MÓN — hủy cả đơn cũng chuyển từng món sang 'cancelled':
--   • orders.confirmed_at IS NULL (QR chưa duyệt / bị từ chối) → không tính
--   • món chưa hủy → tính
--   • món hủy SAU mốc in phiếu bếp sớm nhất của đơn (quy ước 0037) → tính (món đã làm)
--   • món hủy trước khi in → không tính
-- Lượng thô = định lượng ÷ yield (chỉ nguyên liệu mua vào).
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
  cancel_usage   numeric,   -- phần của order_usage đến từ món hủy sau khi in (hao hụt có lý do)
  on_hand        numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select min(se.created_at) as start_at
    from public.stock_entries se
    where se.tenant_id = p_tenant
  ),
  ledger as (
    select se.ingredient_id,
      sum(se.qty) filter (where se.kind = 'receipt')      as receipts,
      sum(se.qty) filter (where se.kind = 'batch_in')     as batch_in,
      sum(se.qty) filter (where se.kind = 'batch_out')    as batch_out,
      sum(se.qty) filter (where se.kind = 'waste')        as waste,
      sum(se.qty) filter (where se.kind = 'count_adjust') as adjust
    from public.stock_entries se
    where se.tenant_id = p_tenant
      and se.created_at < p_at
    group by se.ingredient_id
  ),
  used as (
    select oi.id, oi.menu_item_id, oi.qty,
           (oi.status = 'cancelled') as cancelled_after_print
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    cross join base
    where oi.tenant_id = p_tenant
      and o.tenant_id = p_tenant
      and o.confirmed_at is not null
      and o.confirmed_at >= base.start_at
      and o.confirmed_at <  p_at
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
  ),
  usage as (
    select l.ingredient_id,
      sum(l.qty * 100.0 / case when i.kind = 'purchased' then i.yield_pct else 100 end) as order_usage,
      sum(l.qty * 100.0 / case when i.kind = 'purchased' then i.yield_pct else 100 end)
        filter (where l.cancelled_after_print) as cancel_usage
    from lines l
    join public.ingredients i on i.id = l.ingredient_id
    group by l.ingredient_id
  )
  select i.id,
    0::numeric,
    coalesce(lg.receipts, 0),
    coalesce(lg.batch_in, 0),
    coalesce(-lg.batch_out, 0),
    coalesce(-lg.waste, 0),
    coalesce(lg.adjust, 0),
    round(coalesce(us.order_usage, 0), 3),
    round(coalesce(us.cancel_usage, 0), 3),
    round(
      coalesce(lg.receipts, 0) + coalesce(lg.batch_in, 0) + coalesce(lg.batch_out, 0)
      + coalesce(lg.waste, 0) + coalesce(lg.adjust, 0) - coalesce(us.order_usage, 0),
      3)
  from public.ingredients i
  left join ledger lg on lg.ingredient_id = i.id
  left join usage  us on us.ingredient_id = i.id
  where i.tenant_id = p_tenant
    and (lg.ingredient_id is not null or us.ingredient_id is not null);
$$;

revoke all on function public.inventory_on_hand(uuid, timestamptz) from public, anon;
grant execute on function public.inventory_on_hand(uuid, timestamptz) to authenticated;

-- ---- Số phần dự đoán --------------------------------------------------------------------
-- Chỉ nguyên liệu ĐÃ TỪNG CÓ DÒNG SỔ mới tham gia: gia vị khai trong định lượng để tính giá vốn
-- nhưng không ai nhập muối mỗi sáng — tính cả chúng thì món nào cũng "có thể đã hết".
-- Bán thành phẩm dùng tồn ĐÃ CHẾ BIẾN (nồi chưa nấu thì bát chưa bán được). Modifier không tham
-- gia số phần của món gốc — option có số phần riêng.
create or replace function public.menu_portions(p_tenant uuid)
returns table (menu_item_id uuid, modifier_option_id uuid, portions int)
language sql
stable
security invoker
set search_path = public
as $$
  with oh as (
    select * from public.inventory_on_hand(p_tenant, now())
  ),
  tracked as (
    select distinct se.ingredient_id
    from public.stock_entries se
    where se.tenant_id = p_tenant
  ),
  per_line as (
    select rl.menu_item_id, rl.modifier_option_id,
      floor(
        coalesce(oh.on_hand, 0)
        / (rl.qty * 100.0 / case when i.kind = 'purchased' then i.yield_pct else 100 end)
      ) as n
    from public.recipe_lines rl
    join public.ingredients i on i.id = rl.ingredient_id
    join tracked t on t.ingredient_id = rl.ingredient_id
    left join oh on oh.ingredient_id = rl.ingredient_id
    where rl.tenant_id = p_tenant
      and rl.parent_ingredient_id is null
  )
  select pl.menu_item_id, pl.modifier_option_id, min(pl.n)::int
  from per_line pl
  group by pl.menu_item_id, pl.modifier_option_id;
$$;

revoke all on function public.menu_portions(uuid) from public, anon;
grant execute on function public.menu_portions(uuid) to authenticated;
