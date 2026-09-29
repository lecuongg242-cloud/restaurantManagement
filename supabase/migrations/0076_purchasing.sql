-- 0076_purchasing.sql — Nhà cung cấp + phiếu nhập + phiếu chi tự sinh (P20 / plan 20-01, PURCH-01..04, QD-027).
--
-- Phiếu nhập là chứng từ trung tâm (QD-027 D1): Phiếu tạm → Đã nhập hàng → Đã hủy. "Hoàn thành" ghi dòng sổ kho
-- `receipt` như nhập buổi sáng P10 (không thêm kind), kèm `purchase_receipt_id`. Ngày vào kho = ngày VN lúc hoàn thành,
-- tính ở DB — không bao giờ ghi vào ngày đã chốt sổ (0047 bỏ qua im lặng dòng có business_date ≤ ngày chốt).
--
-- Phiếu nhập, dòng phiếu, phiếu chi CHỈ ghi qua các hàm dưới (security definer, tự kiểm chủ/quản lý). Người dùng chỉ
-- được ĐỌC thẳng bảng (RLS manager_tenants) ⇒ phiếu đã nhập không thể bị sửa số qua PostgREST.

-- ---- Bộ đếm mã chứng từ -----------------------------------------------------------------------------------------
-- Không theo khuôn nextBillNo (max+1, không unique): hai người bấm cùng lúc phải ra hai mã khác nhau.
create table if not exists public.doc_counters (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind      text not null check (kind in ('ncc', 'pn', 'pc', 'pt')),
  last_no   integer not null default 0,
  primary key (tenant_id, kind)
);
alter table public.doc_counters enable row level security;  -- không policy: chỉ hàm definer chạm tới
revoke all on public.doc_counters from anon, authenticated;

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
  return case p_kind when 'ncc' then 'NCC' when 'pn' then 'PN' when 'pc' then 'PC' else 'PT' end
         || lpad(v_no::text, 6, '0');
end;
$$;
revoke execute on function public.next_doc_code(uuid, text) from public, anon, authenticated;

-- Membership chủ / quản lý đang hoạt động của người gọi ở quán (quán còn dùng được). Null = không đủ quyền.
create or replace function public.purchasing_actor(p_tenant uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id from public.memberships m
  where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.active and m.role in ('owner', 'manager')
    and m.tenant_id in (select public.auth_tenant_ids())
  order by (m.role = 'owner') desc
  limit 1
$$;
revoke execute on function public.purchasing_actor(uuid) from public, anon, authenticated;

-- Ngày kinh doanh theo giờ VN (cùng `businessDate()` ở TS).
create or replace function public.vn_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-- ---- Nhà cung cấp -----------------------------------------------------------------------------------------------
create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  code       text not null,
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  phone      text null check (phone is null or phone ~ '^[0-9]{8,15}$'),
  email      text null check (email is null or char_length(email) <= 120),
  address    text null check (address is null or char_length(address) <= 200),
  tax_code   text null check (tax_code is null or tax_code ~ '^[0-9-]{10,14}$'),
  note       text null check (note is null or char_length(note) <= 500),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create unique index if not exists uq_suppliers_tenant_phone on public.suppliers (tenant_id, phone) where phone is not null;
create index if not exists idx_suppliers_tenant on public.suppliers (tenant_id, active, name);

-- Mã NCC000001 tự sinh khi app không gửi mã.
create or replace function public.suppliers_fill_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    if public.purchasing_actor(new.tenant_id) is null then
      raise exception 'khong du quyen' using errcode = '42501';
    end if;
    new.code := public.next_doc_code(new.tenant_id, 'ncc');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_suppliers_fill_code on public.suppliers;
create trigger trg_suppliers_fill_code before insert on public.suppliers
  for each row execute function public.suppliers_fill_code();

alter table public.suppliers enable row level security;
drop policy if exists suppliers_manager on public.suppliers;
create policy suppliers_manager on public.suppliers
  for all
  using (tenant_id = any (public.manager_tenants(array[tenant_id])))
  with check (tenant_id = any (public.manager_tenants(array[tenant_id])));
revoke all on public.suppliers from anon;

-- ---- Phiếu nhập -------------------------------------------------------------------------------------------------
create table if not exists public.purchase_receipts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  code          text not null,
  supplier_id   uuid null references public.suppliers (id) on delete restrict,
  status        text not null default 'draft' check (status in ('draft', 'done', 'cancelled')),
  doc_date      date not null,                 -- ngày chứng từ: công nợ, sổ quỹ (sửa được)
  stock_date    date null,                     -- ngày vào kho = ngày VN lúc hoàn thành (không sửa)
  subtotal      integer not null default 0 check (subtotal >= 0),
  discount      integer not null default 0 check (discount >= 0),
  total         integer not null default 0,    -- "Cần trả NCC"
  pay_now       integer not null default 0 check (pay_now >= 0),  -- "Tiền trả NCC" ghi lúc hoàn thành
  pay_fund      text not null default 'cash' check (pay_fund in ('cash', 'bank')),
  note          text null check (note is null or char_length(note) <= 500),
  copied_from   uuid null references public.purchase_receipts (id) on delete set null,
  created_by    uuid null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_by  uuid null,
  completed_at  timestamptz null,
  cancelled_by  uuid null,
  cancelled_at  timestamptz null,
  unique (tenant_id, code),
  constraint purchase_receipts_total check (total = subtotal - discount and total >= 0),
  constraint purchase_receipts_pay check (pay_now <= total),
  constraint purchase_receipts_done check ((status = 'draft') = (completed_at is null) or status = 'cancelled'),
  constraint purchase_receipts_stock_date check ((stock_date is not null) = (completed_at is not null))
);
create index if not exists idx_purchase_receipts_tenant on public.purchase_receipts (tenant_id, doc_date desc, code desc);
create index if not exists idx_purchase_receipts_supplier on public.purchase_receipts (supplier_id) where supplier_id is not null;

create table if not exists public.purchase_receipt_lines (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  receipt_id      uuid not null references public.purchase_receipts (id) on delete cascade,
  ingredient_id   uuid not null references public.ingredients (id) on delete restrict,
  qty             numeric(14, 3) not null check (qty > 0),              -- theo ĐƠN VỊ NHẬP
  purchase_unit   text null,
  purchase_factor numeric(14, 4) not null check (purchase_factor > 0),  -- chụp lúc lưu
  unit_price      integer null check (unit_price is null or unit_price >= 0),  -- đ / đơn vị nhập, tùy chọn
  amount          integer null check (amount is null or amount >= 0),         -- thành tiền, rỗng khi không giá
  sort            integer not null default 0,
  constraint purchase_receipt_lines_amount check ((unit_price is null) = (amount is null))
);
create index if not exists idx_purchase_receipt_lines_receipt on public.purchase_receipt_lines (receipt_id, sort);

-- ---- Phiếu thu / chi (20-01 chỉ sinh phiếu chi tự động; 20-02 thêm phiếu tay + danh mục) -------------------------
create table if not exists public.cash_vouchers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  code                text not null,
  direction           text not null check (direction in ('in', 'out')),
  fund                text not null check (fund in ('cash', 'bank')),
  amount              integer not null check (amount > 0),
  occurred_at         timestamptz not null default now(),
  source              text not null check (source in ('manual', 'purchase', 'supplier_payment', 'opening')),
  supplier_id         uuid null references public.suppliers (id) on delete restrict,
  purchase_receipt_id uuid null references public.purchase_receipts (id) on delete restrict,
  status              text not null default 'active' check (status in ('active', 'cancelled')),
  note                text null check (note is null or char_length(note) <= 500),
  created_by          uuid null,
  created_at          timestamptz not null default now(),
  cancelled_by        uuid null,
  cancelled_at        timestamptz null,
  unique (tenant_id, code),
  constraint cash_vouchers_purchase check (source <> 'purchase' or (purchase_receipt_id is not null and direction = 'out'))
);
create index if not exists idx_cash_vouchers_tenant on public.cash_vouchers (tenant_id, occurred_at);
create index if not exists idx_cash_vouchers_supplier on public.cash_vouchers (supplier_id) where supplier_id is not null;
create index if not exists idx_cash_vouchers_receipt on public.cash_vouchers (purchase_receipt_id) where purchase_receipt_id is not null;

-- ---- Dòng sổ kho trỏ về phiếu nhập -----------------------------------------------------------------------------
alter table public.stock_entries
  add column if not exists purchase_receipt_id uuid null references public.purchase_receipts (id) on delete restrict;
create index if not exists idx_stock_entries_receipt on public.stock_entries (purchase_receipt_id)
  where purchase_receipt_id is not null;

-- Dòng `receipt` ÂM chỉ hợp lệ khi là dòng bù của phiếu nhập đã hủy sau khi ngày kho đã chốt: gắn phiếu + không giá
-- (không giá ⇒ `loadPrices` bỏ qua, bình quân ngày không lệch). Mọi `receipt` âm khác vẫn bị chặn.
alter table public.stock_entries drop constraint if exists stock_entries_sign;
alter table public.stock_entries add constraint stock_entries_sign check (
  (kind in ('receipt', 'batch_in') and qty > 0)
  or (kind = 'receipt' and qty < 0 and purchase_receipt_id is not null and unit_cost is null)
  or (kind in ('batch_out', 'waste') and qty < 0)
  or kind = 'count_adjust'
);

-- ---- RLS: chỉ ĐỌC thẳng, ghi qua hàm ---------------------------------------------------------------------------
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;
alter table public.cash_vouchers enable row level security;

drop policy if exists purchase_receipts_read on public.purchase_receipts;
create policy purchase_receipts_read on public.purchase_receipts
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
drop policy if exists purchase_receipt_lines_read on public.purchase_receipt_lines;
create policy purchase_receipt_lines_read on public.purchase_receipt_lines
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
drop policy if exists cash_vouchers_read on public.cash_vouchers;
create policy cash_vouchers_read on public.cash_vouchers
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));

revoke all on public.purchase_receipts from anon;
revoke all on public.purchase_receipt_lines from anon;
revoke all on public.cash_vouchers from anon;
revoke insert, update, delete on public.purchase_receipts from authenticated;
revoke insert, update, delete on public.purchase_receipt_lines from authenticated;
revoke insert, update, delete on public.cash_vouchers from authenticated;

-- ---- Lưu / hoàn thành phiếu nhập --------------------------------------------------------------------------------
-- p_receipt: { id?, supplier_id?, doc_date?, discount, pay_now, pay_fund, note?,
--              lines: [{ ingredient_id, qty (đơn vị nhập), unit_price? (đ / đơn vị nhập) }] }
-- Có `id` = sửa tiếp một phiếu tạm. `p_complete` = "Hoàn thành": ghi sổ kho + phiếu chi (nếu trả ngay) trong cùng giao dịch.
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
  v_doc_date date := coalesce(nullif(p_receipt ->> 'doc_date', '')::date, public.vn_today());
  v_discount integer := coalesce((p_receipt ->> 'discount')::integer, 0);
  v_pay_now  integer := coalesce((p_receipt ->> 'pay_now')::integer, 0);
  v_fund     text := coalesce(nullif(p_receipt ->> 'pay_fund', ''), 'cash');
  v_note     text := nullif(btrim(coalesce(p_receipt ->> 'note', '')), '');
  v_lines    jsonb := coalesce(p_receipt -> 'lines', '[]'::jsonb);
  v_subtotal integer;
  v_total    integer;
  v_today    date := public.vn_today();
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

  if v_id is null then
    v_code := public.next_doc_code(p_tenant, 'pn');
    insert into public.purchase_receipts
      (tenant_id, code, supplier_id, doc_date, subtotal, discount, total, pay_now, pay_fund, note, created_by)
    values
      (p_tenant, v_code, v_supplier, v_doc_date, v_subtotal, v_discount, v_total, v_pay_now, v_fund, v_note, v_actor)
    returning purchase_receipts.id into v_id;
  else
    update public.purchase_receipts r
       set supplier_id = v_supplier, doc_date = v_doc_date, subtotal = v_subtotal, discount = v_discount,
           total = v_total, pay_now = v_pay_now, pay_fund = v_fund, note = v_note, updated_at = now()
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
       set status = 'done', stock_date = v_today, completed_by = v_actor, completed_at = now(), updated_at = now()
     where r.id = v_id;

    -- Giá / đơn vị gốc = đơn giá ÷ hệ số (như 10-02), nhân tỷ lệ giảm giá của phiếu để giá vốn phản ánh giá thật đã trả.
    insert into public.stock_entries
      (tenant_id, business_date, ingredient_id, kind, qty, unit_cost, purchase_receipt_id, created_by)
    select p_tenant, v_today, pl.ingredient_id, 'receipt', round(pl.qty * pl.purchase_factor, 3),
           case when pl.unit_price is null then null
                when v_subtotal > 0 then round(pl.unit_price::numeric / pl.purchase_factor * v_total::numeric / v_subtotal, 6)
                else round(pl.unit_price::numeric / pl.purchase_factor, 6) end,
           v_id, v_actor
    from public.purchase_receipt_lines pl
    where pl.receipt_id = v_id;

    update public.ingredients i
       set last_unit_cost = se.unit_cost, last_cost_at = now(), updated_at = now()
      from public.stock_entries se
     where se.purchase_receipt_id = v_id and se.unit_cost is not null
       and i.id = se.ingredient_id and i.tenant_id = p_tenant;

    if v_pay_now > 0 then
      insert into public.cash_vouchers
        (tenant_id, code, direction, fund, amount, source, supplier_id, purchase_receipt_id, note, created_by)
      values
        (p_tenant, public.next_doc_code(p_tenant, 'pc'), 'out', v_fund, v_pay_now, 'purchase', v_supplier, v_id,
         'Trả tiền phiếu nhập ' || v_code, v_actor);
    end if;
  end if;

  return query select v_id, v_code;
end;
$$;
revoke execute on function public.save_purchase_receipt(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_purchase_receipt(uuid, jsonb, boolean) to authenticated;

-- ---- Hủy bỏ phiếu nhập (QD-027 D5) ------------------------------------------------------------------------------
-- Ngày kho CHƯA có bản chốt → xóa dòng sổ của phiếu (tồn trở lại như trước). ĐÃ chốt → dòng `receipt` âm hôm nay,
-- không giá; bản chốt cũ không đổi. Hủy phiếu chi đi kèm nếu người dùng chọn.
create or replace function public.cancel_purchase_receipt(p_receipt uuid, p_cancel_vouchers boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.purchase_receipts%rowtype;
  v_actor  uuid;
  v_closed boolean;
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
    select exists (
      select 1 from public.daily_closes d where d.tenant_id = r.tenant_id and d.business_date >= r.stock_date
    ) into v_closed;
    if v_closed then
      insert into public.stock_entries
        (tenant_id, business_date, ingredient_id, kind, qty, unit_cost, purchase_receipt_id, note, created_by)
      select r.tenant_id, public.vn_today(), se.ingredient_id, 'receipt', -sum(se.qty), null, r.id,
             'Hủy phiếu nhập ' || r.code, v_actor
      from public.stock_entries se
      where se.purchase_receipt_id = r.id
      group by se.ingredient_id
      having sum(se.qty) > 0;
    else
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

-- ---- Sao chép → phiếu tạm mới ----------------------------------------------------------------------------------
create or replace function public.copy_purchase_receipt(p_receipt uuid)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r       public.purchase_receipts%rowtype;
  v_actor uuid;
  v_id    uuid;
  v_code  text;
begin
  select * into r from public.purchase_receipts pr where pr.id = p_receipt;
  if not found then
    raise exception 'khong_tim_thay' using errcode = '42501';
  end if;
  v_actor := public.purchasing_actor(r.tenant_id);
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;

  v_code := public.next_doc_code(r.tenant_id, 'pn');
  insert into public.purchase_receipts
    (tenant_id, code, supplier_id, doc_date, subtotal, discount, total, pay_now, pay_fund, note, copied_from, created_by)
  values
    (r.tenant_id, v_code,
     (select s.id from public.suppliers s where s.id = r.supplier_id and s.active),
     public.vn_today(), r.subtotal, r.discount, r.total, 0, r.pay_fund, r.note, r.id, v_actor)
  returning purchase_receipts.id into v_id;

  insert into public.purchase_receipt_lines
    (tenant_id, receipt_id, ingredient_id, qty, purchase_unit, purchase_factor, unit_price, amount, sort)
  select pl.tenant_id, v_id, pl.ingredient_id, pl.qty, pl.purchase_unit, pl.purchase_factor, pl.unit_price, pl.amount, pl.sort
  from public.purchase_receipt_lines pl
  where pl.receipt_id = r.id;

  return query select v_id, v_code;
end;
$$;
revoke execute on function public.copy_purchase_receipt(uuid) from public, anon;
grant execute on function public.copy_purchase_receipt(uuid) to authenticated;

-- ---- Sửa phiếu đã nhập: chỉ ghi chú, ngày chứng từ, NCC khi đang trống -----------------------------------------
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
         doc_date = coalesce(p_doc_date, doc_date),
         supplier_id = coalesce(supplier_id, p_supplier),
         updated_at = now()
   where id = r.id;
end;
$$;
revoke execute on function public.update_purchase_receipt_meta(uuid, text, date, uuid) from public, anon;
grant execute on function public.update_purchase_receipt_meta(uuid, text, date, uuid) to authenticated;

-- ---- Tổng mua / nợ theo NCC (20-03 thay bằng bản có điều chỉnh + phân bổ) ---------------------------------------
create or replace function public.supplier_summaries(p_tenant uuid)
returns table (supplier_id uuid, total_purchase bigint, paid bigint, debt bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with mua as (
    select r.supplier_id, sum(r.total)::bigint as total_purchase
    from public.purchase_receipts r
    where r.tenant_id = p_tenant and r.status = 'done' and r.supplier_id is not null
    group by 1
  ), tra as (
    select v.supplier_id, sum(v.amount)::bigint as paid
    from public.cash_vouchers v
    where v.tenant_id = p_tenant and v.status = 'active' and v.direction = 'out' and v.supplier_id is not null
    group by 1
  )
  select s.id, coalesce(m.total_purchase, 0), coalesce(t.paid, 0), coalesce(m.total_purchase, 0) - coalesce(t.paid, 0)
  from public.suppliers s
  left join mua m on m.supplier_id = s.id
  left join tra t on t.supplier_id = s.id
  where s.tenant_id = p_tenant
$$;
revoke execute on function public.supplier_summaries(uuid) from public, anon;
grant execute on function public.supplier_summaries(uuid) to authenticated;
