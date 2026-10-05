-- 0085_late_receipts.sql — Nhập phiếu muộn không làm sai kho (P34, QD-034, INV-18..22).
--
-- 1. Sổ kho chạy theo THỜI GIAN PHÁT SINH (`stock_entries.occurred_at`), không theo giờ bấm (`created_at`): phiếu nhập ghi
--    lúc 20:00 cho hàng về lúc 14:00 thì tồn lúc 14:01 đã có hàng. `business_date` luôn = ngày VN của `occurred_at`
--    (trigger) — một nguồn sự thật, không còn lệch ngày sát nửa đêm giữa máy chủ app và DB.
-- 2. Phiếu nhập có "Thời gian nhập" (`purchase_receipts.received_at`); phiếu tạm để trống = lúc bấm Hoàn thành.
-- 3. Phiếu kiểm kê thành chứng từ (`stock_counts`, mã KK…) và là MỐC KHÓA (như iPOS): mọi thay đổi có thời gian ≤ lúc
--    kiểm kê của cùng nguyên liệu bị chặn — muốn ghi thì Hủy phiếu kiểm kê, ghi, rồi Hoàn thành lại (giữ số đếm + giờ cũ).
--
-- Phiếu kiểm kê, dòng phiếu chỉ ghi qua hàm (security definer, chủ / quản lý) như phiếu nhập (QD-027).

-- ---- 1. Thời gian phát sinh của dòng sổ --------------------------------------------------------------------------
alter table public.stock_entries add column if not exists occurred_at timestamptz;

-- Dòng cũ: giờ bấm, trừ khi script lùi ngày đã đặt business_date khác ngày của created_at → giữa trưa ngày đó.
update public.stock_entries se
   set occurred_at = case
     when (se.created_at at time zone 'Asia/Ho_Chi_Minh')::date = se.business_date then se.created_at
     else (se.business_date + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
   end
 where se.occurred_at is null;

alter table public.stock_entries alter column occurred_at set default now();
alter table public.stock_entries alter column occurred_at set not null;
create index if not exists idx_stock_entries_tenant_occurred on public.stock_entries (tenant_id, occurred_at);

create or replace function public.stock_entries_business_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.business_date := (new.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date;
  return new;
end;
$$;
drop trigger if exists trg_stock_entries_business_date on public.stock_entries;
create trigger trg_stock_entries_business_date before insert or update of occurred_at, business_date
  on public.stock_entries for each row execute function public.stock_entries_business_date();

-- ---- 2. Thời gian nhập của phiếu nhập ----------------------------------------------------------------------------
alter table public.purchase_receipts add column if not exists received_at timestamptz;
update public.purchase_receipts r
   set received_at = case
     when (r.completed_at at time zone 'Asia/Ho_Chi_Minh')::date = r.stock_date then r.completed_at
     else (r.stock_date + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
   end
 where r.received_at is null and r.completed_at is not null;
alter table public.purchase_receipts drop constraint if exists purchase_receipts_received;
alter table public.purchase_receipts add constraint purchase_receipts_received
  check (completed_at is null or received_at is not null);
create index if not exists idx_purchase_receipts_received on public.purchase_receipts (tenant_id, received_at desc);

-- ---- 3. Phiếu kiểm kê ----------------------------------------------------------------------------------------------
alter table public.doc_counters drop constraint if exists doc_counters_kind_check;
alter table public.doc_counters add constraint doc_counters_kind_check check (kind in ('ncc', 'pn', 'pc', 'pt', 'kk'));

create or replace function public.next_doc_code(p_tenant uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no integer;
begin
  insert into public.doc_counters (tenant_id, kind, last_no) values (p_tenant, p_kind, 1)
  on conflict (tenant_id, kind) do update set last_no = public.doc_counters.last_no + 1
  returning last_no into v_no;
  return case p_kind when 'ncc' then 'NCC' when 'pn' then 'PN' when 'pc' then 'PC' when 'kk' then 'KK' else 'PT' end
         || lpad(v_no::text, 6, '0');
end;
$$;
revoke execute on function public.next_doc_code(uuid, text) from public, anon, authenticated;

create table if not exists public.stock_counts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  code             text not null,
  counted_at       timestamptz not null,
  status           text not null default 'done' check (status in ('done', 'cancelled')),
  -- Phiếu nhập cuối trước lúc đếm — bằng chứng cut-off (ISA 501 A8).
  last_receipt_id  uuid null references public.purchase_receipts (id) on delete set null,
  redo_of          uuid null references public.stock_counts (id) on delete set null,
  created_by       uuid null,
  created_at       timestamptz not null default now(),
  cancelled_by     uuid null,
  cancelled_at     timestamptz null,
  unique (tenant_id, code),
  constraint stock_counts_cancel check ((status = 'cancelled') = (cancelled_at is not null))
);
create index if not exists idx_stock_counts_tenant on public.stock_counts (tenant_id, counted_at desc);

create table if not exists public.stock_count_lines (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  count_id       uuid not null references public.stock_counts (id) on delete cascade,
  -- cascade: app không xóa nguyên liệu (chỉ ẩn); dòng sổ (restrict) đã giữ nguyên liệu còn phát sinh.
  ingredient_id  uuid not null references public.ingredients (id) on delete cascade,
  counted_base   numeric(14, 3) not null check (counted_base >= 0),   -- số đếm, đơn vị gốc
  count_unit     text not null check (count_unit in ('purchase', 'base')),
  theoretical    numeric(14, 3) not null,                           -- tồn sổ tại lúc kiểm kê
  diff           numeric(14, 3) not null,                           -- số đếm − tồn sổ
  unique (count_id, ingredient_id)
);
create index if not exists idx_stock_count_lines_ingredient on public.stock_count_lines (tenant_id, ingredient_id);

alter table public.stock_entries
  add column if not exists count_id uuid null references public.stock_counts (id) on delete cascade;
create index if not exists idx_stock_entries_count on public.stock_entries (count_id) where count_id is not null;

alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
drop policy if exists stock_counts_read on public.stock_counts;
create policy stock_counts_read on public.stock_counts
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
drop policy if exists stock_count_lines_read on public.stock_count_lines;
create policy stock_count_lines_read on public.stock_count_lines
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
revoke all on public.stock_counts from anon;
revoke all on public.stock_count_lines from anon;
revoke insert, update, delete on public.stock_counts from authenticated;
revoke insert, update, delete on public.stock_count_lines from authenticated;

-- ---- Mốc khóa -------------------------------------------------------------------------------------------------------
-- Phiếu kiểm kê ĐÃ CÂN BẰNG có thời gian ≥ p_at chứa một trong các nguyên liệu. Rỗng = ghi / hủy được.
create or replace function public.inventory_lock_conflicts(
  p_tenant      uuid,
  p_ingredients uuid[],
  p_at          timestamptz,
  p_except      uuid default null
)
returns table (ingredient_id uuid, ingredient_name text, count_id uuid, count_code text, counted_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select l.ingredient_id, i.name, c.id, c.code, c.counted_at
  from public.stock_counts c
  join public.stock_count_lines l on l.count_id = c.id
  join public.ingredients i on i.id = l.ingredient_id
  where c.tenant_id = p_tenant
    and c.status = 'done'
    and c.counted_at >= p_at
    and l.ingredient_id = any (p_ingredients)
    and (p_except is null or c.id <> p_except)
  order by c.counted_at, i.name;
$$;
revoke all on function public.inventory_lock_conflicts(uuid, uuid[], timestamptz, uuid) from public, anon;
grant execute on function public.inventory_lock_conflicts(uuid, uuid[], timestamptz, uuid) to authenticated;

-- Vướng mốc khóa → lỗi `vuong_kiem_ke`, chi tiết là mảng JSON để app nói rõ nguyên liệu nào, phiếu nào, mấy giờ.
create or replace function public.assert_no_lock(p_tenant uuid, p_ingredients uuid[], p_at timestamptz, p_except uuid default null)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_detail jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'ingredient', x.ingredient_name, 'count_id', x.count_id, 'code', x.count_code, 'at', x.counted_at))
    into v_detail
  from public.inventory_lock_conflicts(p_tenant, p_ingredients, p_at, p_except) x;
  if v_detail is not null then
    raise exception 'vuong_kiem_ke' using errcode = '22023', detail = v_detail::text;
  end if;
end;
$$;
revoke all on function public.assert_no_lock(uuid, uuid[], timestamptz, uuid) from public, anon, authenticated;

-- Ngày kho đã có bản chốt (bản chốt bất biến, QD-017 D7).
create or replace function public.inventory_day_closed(p_tenant uuid, p_day date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.daily_closes d where d.tenant_id = p_tenant and d.business_date >= p_day);
$$;
revoke all on function public.inventory_day_closed(uuid, date) from public, anon, authenticated;

-- ---- Tồn lý thuyết + số liệu một ngày: theo occurred_at (thay 0047, cột trả về giữ nguyên) ------------------------
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
        (select min(se.occurred_at) from public.stock_entries se where se.tenant_id = p_tenant)
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
      and se.occurred_at < p_at
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
      (select min(se.occurred_at) from public.stock_entries se where se.tenant_id = p_tenant) as first_at
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

-- ---- Phiếu nhập: Thời gian nhập + mốc khóa (thay 0076) --------------------------------------------------------------
-- p_receipt thêm `received_at` (ISO, rỗng = lúc bấm Hoàn thành). `doc_date` / `stock_date` = ngày VN của thời gian nhập.
create or replace function public.save_purchase_receipt(p_tenant uuid, p_receipt jsonb, p_complete boolean)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor    uuid := public.purchasing_actor(p_tenant);
  v_id       uuid := nullif(p_receipt ->> 'id', '')::uuid;
  v_code     text;
  v_supplier uuid := nullif(p_receipt ->> 'supplier_id', '')::uuid;
  v_received timestamptz := nullif(p_receipt ->> 'received_at', '')::timestamptz;
  v_doc_date date := coalesce((v_received at time zone 'Asia/Ho_Chi_Minh')::date, public.vn_today());
  v_discount integer := coalesce((p_receipt ->> 'discount')::integer, 0);
  v_pay_now  integer := coalesce((p_receipt ->> 'pay_now')::integer, 0);
  v_fund     text := coalesce(nullif(p_receipt ->> 'pay_fund', ''), 'cash');
  v_note     text := nullif(btrim(coalesce(p_receipt ->> 'note', '')), '');
  v_lines    jsonb := coalesce(p_receipt -> 'lines', '[]'::jsonb);
  v_subtotal integer;
  v_total    integer;
  v_at       timestamptz;
  v_day      date;
  v_n        integer;
begin
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'phieu_trong' using errcode = '22023';
  end if;
  if v_fund not in ('cash', 'bank') then
    raise exception 'quy_khong_hop_le' using errcode = '22023';
  end if;
  if v_supplier is not null and not exists (
    select 1 from public.suppliers s where s.id = v_supplier and s.tenant_id = p_tenant and s.active
  ) then
    raise exception 'ncc_khong_hop_le' using errcode = '42501';
  end if;

  -- Dòng hợp lệ: nguyên liệu MUA VÀO, đang dùng, của đúng quán (khóa ngoại bỏ qua RLS — bài học record_batch).
  select count(*) into v_n
  from jsonb_array_elements(v_lines) l
  where not exists (
    select 1 from public.ingredients i
    where i.id = (l ->> 'ingredient_id')::uuid and i.tenant_id = p_tenant and i.active and i.kind = 'purchased'
  )
  or coalesce((l ->> 'qty')::numeric, 0) <= 0
  or coalesce(nullif(l ->> 'unit_price', '')::integer, 0) < 0;
  if v_n > 0 then
    raise exception 'dong_khong_hop_le' using errcode = '22023';
  end if;

  select coalesce(sum(round((l ->> 'qty')::numeric * nullif(l ->> 'unit_price', '')::integer)), 0)::integer
    into v_subtotal
  from jsonb_array_elements(v_lines) l
  where nullif(l ->> 'unit_price', '') is not null;

  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'giam_gia_khong_hop_le' using errcode = '22023';
  end if;
  v_total := v_subtotal - v_discount;
  if v_pay_now < 0 or v_pay_now > v_total then
    raise exception 'tien_tra_khong_hop_le' using errcode = '22023';
  end if;
  -- Không có NCC thì không có chỗ ghi nợ ⇒ phải trả đủ (QD-027 PURCH-04).
  if p_complete and v_supplier is null and v_pay_now <> v_total then
    raise exception 'thieu_ncc_con_no' using errcode = '22023';
  end if;

  if p_complete then
    -- Thời gian nhập: không ở tương lai (cho lệch đồng hồ 2 phút), không rơi vào ngày đã chốt, không trước một lần
    -- kiểm kê đã cân bằng của cùng nguyên liệu (QD-034 D2).
    v_at := coalesce(v_received, now());
    v_day := (v_at at time zone 'Asia/Ho_Chi_Minh')::date;
    if v_at > now() + interval '2 minutes' then
      raise exception 'thoi_gian_tuong_lai' using errcode = '22023';
    end if;
    -- Sổ để mở 7 ngày (OPEN_DAYS, lib/inventory/close.ts): lùi xa hơn là vào ngày đã / sắp chốt.
    if v_day < public.vn_today() - 6 or public.inventory_day_closed(p_tenant, v_day) then
      raise exception 'ngay_da_chot' using errcode = '22023', detail = v_day::text;
    end if;
    perform public.assert_no_lock(
      p_tenant,
      array(select (l ->> 'ingredient_id')::uuid from jsonb_array_elements(v_lines) l),
      v_at
    );
    v_doc_date := v_day;
  end if;

  if v_id is null then
    v_code := public.next_doc_code(p_tenant, 'pn');
    insert into public.purchase_receipts
      (tenant_id, code, supplier_id, doc_date, received_at, subtotal, discount, total, pay_now, pay_fund, note, created_by)
    values
      (p_tenant, v_code, v_supplier, v_doc_date, v_received, v_subtotal, v_discount, v_total, v_pay_now, v_fund, v_note, v_actor)
    returning purchase_receipts.id into v_id;
  else
    update public.purchase_receipts r
       set supplier_id = v_supplier, doc_date = v_doc_date, received_at = v_received, subtotal = v_subtotal,
           discount = v_discount, total = v_total, pay_now = v_pay_now, pay_fund = v_fund, note = v_note, updated_at = now()
     where r.id = v_id and r.tenant_id = p_tenant and r.status = 'draft'
    returning r.code into v_code;
    if v_code is null then
      raise exception 'khong_phai_phieu_tam' using errcode = '22023';
    end if;
    delete from public.purchase_receipt_lines pl where pl.receipt_id = v_id;
  end if;

  insert into public.purchase_receipt_lines
    (tenant_id, receipt_id, ingredient_id, qty, purchase_unit, purchase_factor, unit_price, amount, sort)
  select p_tenant, v_id, i.id, (l.v ->> 'qty')::numeric, i.purchase_unit, i.purchase_factor,
         nullif(l.v ->> 'unit_price', '')::integer,
         case when nullif(l.v ->> 'unit_price', '') is null then null
              else round((l.v ->> 'qty')::numeric * (l.v ->> 'unit_price')::integer)::integer end,
         l.ord::integer
  from jsonb_array_elements(v_lines) with ordinality as l(v, ord)
  join public.ingredients i on i.id = (l.v ->> 'ingredient_id')::uuid and i.tenant_id = p_tenant;

  if p_complete then
    update public.purchase_receipts r
       set status = 'done', received_at = v_at, doc_date = v_day, stock_date = v_day,
           completed_by = v_actor, completed_at = now(), updated_at = now()
     where r.id = v_id;

    -- Giá / đơn vị gốc = đơn giá ÷ hệ số (như 10-02), nhân tỷ lệ giảm giá của phiếu để giá vốn phản ánh giá thật đã trả.
    -- business_date do trigger tính từ occurred_at.
    insert into public.stock_entries
      (tenant_id, occurred_at, ingredient_id, kind, qty, unit_cost, purchase_receipt_id, created_by)
    select p_tenant, v_at, pl.ingredient_id, 'receipt', round(pl.qty * pl.purchase_factor, 3),
           case when pl.unit_price is null then null
                when v_subtotal > 0 then round(pl.unit_price::numeric / pl.purchase_factor * v_total::numeric / v_subtotal, 6)
                else round(pl.unit_price::numeric / pl.purchase_factor, 6) end,
           v_id, v_actor
    from public.purchase_receipt_lines pl
    where pl.receipt_id = v_id;

    -- "Giá gần nhất": phiếu lùi giờ cũ hơn lần có giá gần nhất thì không ghi đè.
    update public.ingredients i
       set last_unit_cost = se.unit_cost, last_cost_at = v_at, updated_at = now()
      from public.stock_entries se
     where se.purchase_receipt_id = v_id and se.unit_cost is not null
       and i.id = se.ingredient_id and i.tenant_id = p_tenant
       and (i.last_cost_at is null or i.last_cost_at <= v_at);

    if v_pay_now > 0 then
      insert into public.cash_vouchers
        (tenant_id, code, direction, fund, amount, occurred_at, source, supplier_id, purchase_receipt_id, note, created_by)
      values
        (p_tenant, public.next_doc_code(p_tenant, 'pc'), 'out', v_fund, v_pay_now, v_at, 'purchase', v_supplier, v_id,
         'Trả tiền phiếu nhập ' || v_code, v_actor);
    end if;
  end if;

  return query select v_id, v_code;
end;
$$;
revoke execute on function public.save_purchase_receipt(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_purchase_receipt(uuid, jsonb, boolean) to authenticated;

-- Hủy bỏ (QD-027 D5): ngày chưa chốt → xóa dòng sổ, NHƯNG vướng kiểm kê thì chặn (dòng nằm trước lần đếm). Ngày đã
-- chốt → dòng âm lúc hủy (sau mọi lần đếm), bản chốt cũ không đổi.
create or replace function public.cancel_purchase_receipt(p_receipt uuid, p_cancel_vouchers boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.purchase_receipts%rowtype;
  v_actor  uuid;
begin
  select * into r from public.purchase_receipts where id = p_receipt for update;
  if not found then
    raise exception 'khong_tim_thay' using errcode = '42501';
  end if;
  v_actor := public.purchasing_actor(r.tenant_id);
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if r.status = 'cancelled' then
    raise exception 'da_huy' using errcode = '22023';
  end if;

  if r.status = 'done' then
    if public.inventory_day_closed(r.tenant_id, r.stock_date) then
      insert into public.stock_entries
        (tenant_id, ingredient_id, kind, qty, unit_cost, purchase_receipt_id, note, created_by)
      select r.tenant_id, se.ingredient_id, 'receipt', -sum(se.qty), null, r.id,
             'Hủy phiếu nhập ' || r.code, v_actor
      from public.stock_entries se
      where se.purchase_receipt_id = r.id
      group by se.ingredient_id
      having sum(se.qty) > 0;
    else
      perform public.assert_no_lock(
        r.tenant_id,
        array(select distinct se.ingredient_id from public.stock_entries se where se.purchase_receipt_id = r.id),
        r.received_at
      );
      delete from public.stock_entries se where se.purchase_receipt_id = r.id;
    end if;
    if p_cancel_vouchers then
      update public.cash_vouchers v
         set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
       where v.purchase_receipt_id = r.id and v.source = 'purchase' and v.status = 'active';
    end if;
  end if;

  update public.purchase_receipts
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(), updated_at = now()
   where id = r.id;
end;
$$;
revoke execute on function public.cancel_purchase_receipt(uuid, boolean) from public, anon;
grant execute on function public.cancel_purchase_receipt(uuid, boolean) to authenticated;

-- Phiếu đã nhập: chỉ ghi chú + NCC khi đang trống. Thời gian nhập không sửa (QD-034 D1, như KiotViet "Không cho phép thay
-- đổi thời gian giao dịch") — sai thì Hủy bỏ + Sao chép. Giữ chữ ký cũ, bỏ qua p_doc_date.
create or replace function public.update_purchase_receipt_meta(p_receipt uuid, p_note text, p_doc_date date, p_supplier uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.purchase_receipts%rowtype;
begin
  select * into r from public.purchase_receipts where id = p_receipt for update;
  if not found or public.purchasing_actor(r.tenant_id) is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if r.status <> 'done' then
    raise exception 'chi_sua_phieu_da_nhap' using errcode = '22023';
  end if;
  if p_supplier is not null and r.supplier_id is not null and p_supplier <> r.supplier_id then
    raise exception 'da_co_ncc' using errcode = '22023';
  end if;
  if p_supplier is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier and s.tenant_id = r.tenant_id and s.active
  ) then
    raise exception 'ncc_khong_hop_le' using errcode = '42501';
  end if;

  update public.purchase_receipts
     set note = nullif(btrim(coalesce(p_note, '')), ''),
         supplier_id = coalesce(supplier_id, p_supplier),
         updated_at = now()
   where id = r.id;
end;
$$;
revoke execute on function public.update_purchase_receipt_meta(uuid, text, date, uuid) from public, anon;
grant execute on function public.update_purchase_receipt_meta(uuid, text, date, uuid) to authenticated;

-- ---- Hoàn thành phiếu kiểm kê -----------------------------------------------------------------------------------------
-- p_lines: [{ ingredient_id, counted_base (đơn vị gốc, ≥ 0), unit: 'purchase' | 'base' }].
-- Lần đầu: thời gian kiểm kê = bây giờ. Hoàn thành lại (p_redo_of = phiếu đã hủy): GIỮ thời gian kiểm kê cũ.
-- Độ lệch = số đếm − tồn sổ TẠI thời gian kiểm kê, tính ở đây (không tin số máy gửi lên).
create or replace function public.complete_stock_count(p_tenant uuid, p_lines jsonb, p_redo_of uuid default null)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor uuid := public.purchasing_actor(p_tenant);
  v_at    timestamptz := now();
  v_id    uuid;
  v_code  text;
  v_n     integer;
begin
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'phieu_trong' using errcode = '22023';
  end if;
  select count(*) into v_n
  from jsonb_array_elements(p_lines) l
  where not exists (
    select 1 from public.ingredients i where i.id = (l ->> 'ingredient_id')::uuid and i.tenant_id = p_tenant
  )
  or (l ->> 'counted_base') is null
  or (l ->> 'counted_base')::numeric < 0
  or coalesce(l ->> 'unit', '') not in ('purchase', 'base');
  if v_n > 0 then
    raise exception 'dong_khong_hop_le' using errcode = '22023';
  end if;

  if p_redo_of is not null then
    select c.counted_at into v_at
    from public.stock_counts c
    where c.id = p_redo_of and c.tenant_id = p_tenant and c.status = 'cancelled';
    if not found then
      raise exception 'khong_tim_thay' using errcode = '22023';
    end if;
    if exists (select 1 from public.stock_counts c where c.redo_of = p_redo_of and c.status = 'done') then
      raise exception 'da_hoan_thanh_lai' using errcode = '22023';
    end if;
  end if;

  if public.inventory_day_closed(p_tenant, (v_at at time zone 'Asia/Ho_Chi_Minh')::date) then
    raise exception 'ngay_da_chot' using errcode = '22023', detail = ((v_at at time zone 'Asia/Ho_Chi_Minh')::date)::text;
  end if;
  perform public.assert_no_lock(
    p_tenant,
    array(select (l ->> 'ingredient_id')::uuid from jsonb_array_elements(p_lines) l),
    v_at
  );

  v_code := public.next_doc_code(p_tenant, 'kk');
  insert into public.stock_counts (tenant_id, code, counted_at, last_receipt_id, redo_of, created_by)
  values (
    p_tenant, v_code, v_at,
    (select pr.id from public.purchase_receipts pr
      where pr.tenant_id = p_tenant and pr.status = 'done' and pr.received_at <= v_at
      order by pr.received_at desc, pr.code desc limit 1),
    p_redo_of, v_actor
  )
  returning stock_counts.id into v_id;

  insert into public.stock_count_lines (tenant_id, count_id, ingredient_id, counted_base, count_unit, theoretical, diff)
  select p_tenant, v_id, (l ->> 'ingredient_id')::uuid, round((l ->> 'counted_base')::numeric, 3), l ->> 'unit',
         coalesce(oh.on_hand, 0),
         round(round((l ->> 'counted_base')::numeric, 3) - coalesce(oh.on_hand, 0), 3)
  from jsonb_array_elements(p_lines) l
  left join public.inventory_on_hand(p_tenant, v_at) oh on oh.ingredient_id = (l ->> 'ingredient_id')::uuid;

  -- Ghi cả độ lệch 0: "đã kiểm, khớp" khác "không kiểm" (INV-08).
  insert into public.stock_entries (tenant_id, occurred_at, ingredient_id, kind, qty, note, count_id, created_by)
  select p_tenant, v_at, cl.ingredient_id, 'count_adjust', cl.diff, 'đếm ' || trim_scale(cl.counted_base)::text, v_id, v_actor
  from public.stock_count_lines cl
  where cl.count_id = v_id;

  return query select v_id, v_code;
end;
$$;
revoke execute on function public.complete_stock_count(uuid, jsonb, uuid) from public, anon;
grant execute on function public.complete_stock_count(uuid, jsonb, uuid) to authenticated;

-- Hủy phiếu kiểm kê: ngày chưa chốt, không vướng phiếu kiểm sau nó. Xóa dòng lệch (tồn về số theo sổ), GIỮ dòng phiếu để
-- Hoàn thành lại.
create or replace function public.cancel_stock_count(p_count uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c       public.stock_counts%rowtype;
  v_actor uuid;
begin
  select * into c from public.stock_counts where id = p_count for update;
  if not found then
    raise exception 'khong_tim_thay' using errcode = '42501';
  end if;
  v_actor := public.purchasing_actor(c.tenant_id);
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if c.status = 'cancelled' then
    raise exception 'da_huy' using errcode = '22023';
  end if;
  if public.inventory_day_closed(c.tenant_id, (c.counted_at at time zone 'Asia/Ho_Chi_Minh')::date) then
    raise exception 'ngay_da_chot' using errcode = '22023',
      detail = ((c.counted_at at time zone 'Asia/Ho_Chi_Minh')::date)::text;
  end if;
  perform public.assert_no_lock(
    c.tenant_id,
    array(select l.ingredient_id from public.stock_count_lines l where l.count_id = c.id),
    c.counted_at,
    c.id
  );

  delete from public.stock_entries se where se.count_id = c.id;
  update public.stock_counts
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
   where id = c.id;
end;
$$;
revoke execute on function public.cancel_stock_count(uuid) from public, anon;
grant execute on function public.cancel_stock_count(uuid) to authenticated;
