-- 0077_cashbook.sql — Sổ quỹ: loại thu/chi, phiếu thu/chi tay, số dư đầu kỳ, tiền bán hàng (P20 / plan 20-02, CASH-01..04,
-- QD-027 D7–D10).
--
-- Hai quỹ: Tiền mặt (`cash`) và Ngân hàng (`bank`, một tài khoản — QD-027 C8). Tiền bán hàng KHÔNG chép thành phiếu thu
-- (D8, C7): tính từ `payments` theo đúng điều kiện `report_payments` (0040) — mốc là `bills_revenue.business_at` ⇒ Σ ngày D
-- của sổ quỹ = báo cáo "Theo phương thức thanh toán" ngày D, theo định nghĩa.

-- ---- Loại thu / chi -----------------------------------------------------------------------------------------------
-- cost_group = mục chi phí của sổ S2c-HKD (TT 152/2025): a nguyên liệu · b lương · c khấu hao · d dịch vụ mua ngoài ·
-- dd lãi vay · e khác · none không tính. Quán tự sửa (QD-027: khoản nào được trừ do người dùng cấu hình).
create table if not exists public.cash_categories (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  direction      text not null check (direction in ('in', 'out')),
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  cost_group     text not null default 'e' check (cost_group in ('a', 'b', 'c', 'd', 'dd', 'e', 'none')),
  default_in_pnl boolean not null default true,
  sort           integer not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create unique index if not exists uq_cash_categories_name
  on public.cash_categories (tenant_id, direction, lower(btrim(name))) where active;

alter table public.cash_categories enable row level security;
drop policy if exists cash_categories_manager on public.cash_categories;
create policy cash_categories_manager on public.cash_categories
  for all
  using (tenant_id = any (public.manager_tenants(array[tenant_id])))
  with check (tenant_id = any (public.manager_tenants(array[tenant_id])));
revoke all on public.cash_categories from anon;
revoke delete on public.cash_categories from authenticated;  -- ngừng dùng (active = false), không xóa: phiếu cũ trỏ tới

-- ---- Phiếu: phân loại, người nộp/nhận, chứng từ gốc -------------------------------------------------------------
alter table public.cash_vouchers
  add column if not exists category_id       uuid null references public.cash_categories (id) on delete restrict,
  add column if not exists in_pnl            boolean not null default false,
  add column if not exists counterparty_kind text null check (counterparty_kind is null or counterparty_kind in ('supplier', 'staff', 'other')),
  add column if not exists counterparty_name text null check (counterparty_name is null or char_length(counterparty_name) <= 120),
  add column if not exists source_doc_kind   text null check (source_doc_kind is null or source_doc_kind in ('vat_invoice', 'sales_invoice', 'no_invoice', 'other')),
  add column if not exists source_doc_no     text null check (source_doc_no is null or char_length(source_doc_no) <= 40),
  add column if not exists source_doc_date   date null;
create index if not exists idx_cash_vouchers_category on public.cash_vouchers (category_id) where category_id is not null;

-- Nhật ký xuất file: thêm sổ quỹ + kết quả kinh doanh (20-04) một lần.
alter table public.export_logs drop constraint if exists export_logs_kind_check;
alter table public.export_logs add constraint export_logs_kind_check
  check (kind in ('report', 'report_chain', 'customers', 'cashbook', 'pnl'));

-- ---- Danh mục mặc định (QD-027 D10) -----------------------------------------------------------------------------
create or replace function public.ensure_cash_categories(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.purchasing_actor(p_tenant) is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if exists (select 1 from public.cash_categories c where c.tenant_id = p_tenant) then
    return;
  end if;
  insert into public.cash_categories (tenant_id, direction, name, cost_group, default_in_pnl, sort) values
    (p_tenant, 'out', 'Đi chợ',               'a',    true,  10),
    (p_tenant, 'out', 'Gas',                  'a',    true,  20),
    (p_tenant, 'out', 'Lương nhân viên',      'b',    true,  30),
    (p_tenant, 'out', 'Thuê mặt bằng',        'd',    true,  40),
    (p_tenant, 'out', 'Điện',                 'd',    true,  50),
    (p_tenant, 'out', 'Nước',                 'd',    true,  60),
    (p_tenant, 'out', 'Internet/điện thoại',  'd',    true,  70),
    (p_tenant, 'out', 'Sửa chữa',             'd',    true,  80),
    (p_tenant, 'out', 'Chi khác',             'e',    true,  90),
    (p_tenant, 'out', 'Nộp thuế',             'none', false, 95),   -- thuế đã ước tính ở Kết quả kinh doanh (C9)
    (p_tenant, 'out', 'Rút tiền',             'none', false, 99),
    (p_tenant, 'in',  'Thu khác',             'none', true,  10),
    (p_tenant, 'in',  'Nộp tiền vào quỹ',     'none', false, 99);
end;
$$;
revoke execute on function public.ensure_cash_categories(uuid) from public, anon;
grant execute on function public.ensure_cash_categories(uuid) to authenticated;

-- ---- Phiếu thu / chi tay + số dư đầu kỳ -------------------------------------------------------------------------
-- p_voucher: { kind: 'manual'|'opening', direction, fund, amount, occurred_at?, category_id?, in_pnl?, counterparty_kind?,
--              counterparty_name?, supplier_id?, note?, source_doc_kind?, source_doc_no?, source_doc_date? }
create or replace function public.create_cash_voucher(p_tenant uuid, p_voucher jsonb)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor     uuid := public.purchasing_actor(p_tenant);
  v_kind      text := coalesce(nullif(p_voucher ->> 'kind', ''), 'manual');
  v_dir       text := p_voucher ->> 'direction';
  v_fund      text := p_voucher ->> 'fund';
  v_amount    integer := (p_voucher ->> 'amount')::integer;
  v_at        timestamptz := coalesce(nullif(p_voucher ->> 'occurred_at', '')::timestamptz, now());
  v_cat       uuid := nullif(p_voucher ->> 'category_id', '')::uuid;
  v_cp_kind   text := nullif(p_voucher ->> 'counterparty_kind', '');
  v_supplier  uuid := nullif(p_voucher ->> 'supplier_id', '')::uuid;
  v_in_pnl    boolean;
  v_cat_pnl   boolean;
  v_id        uuid;
  v_code      text;
begin
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if v_kind not in ('manual', 'opening') or v_dir not in ('in', 'out') or v_fund not in ('cash', 'bank') then
    raise exception 'phieu_khong_hop_le' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'so_tien_khong_hop_le' using errcode = '22023';
  end if;
  if v_at > now() + interval '1 day' then
    raise exception 'ngay_tuong_lai' using errcode = '22023';
  end if;

  if v_kind = 'opening' then
    -- Số dư đầu kỳ: luôn là tiền VÀO quỹ, không loại, không vào kết quả kinh doanh, không NCC.
    if v_dir <> 'in' then
      raise exception 'phieu_khong_hop_le' using errcode = '22023';
    end if;
    v_cat := null; v_supplier := null; v_cp_kind := null; v_in_pnl := false;
  else
    select c.default_in_pnl into v_cat_pnl
    from public.cash_categories c
    where c.id = v_cat and c.tenant_id = p_tenant and c.direction = v_dir and c.active;
    if not found then
      raise exception 'loai_khong_hop_le' using errcode = '22023';
    end if;
    v_in_pnl := coalesce((p_voucher ->> 'in_pnl')::boolean, v_cat_pnl);
    -- NCC chỉ trên phiếu CHI (trả tiền NCC ⇒ giảm nợ, QD-027 D11). Thu từ NCC để sau (trả hàng nhập — P22).
    if v_supplier is not null then
      if v_dir <> 'out' or not exists (
        select 1 from public.suppliers s where s.id = v_supplier and s.tenant_id = p_tenant
      ) then
        raise exception 'ncc_khong_hop_le' using errcode = '22023';
      end if;
      v_cp_kind := 'supplier';
    end if;
  end if;

  v_code := public.next_doc_code(p_tenant, case when v_dir = 'in' then 'pt' else 'pc' end);
  insert into public.cash_vouchers
    (tenant_id, code, direction, fund, amount, occurred_at, source, supplier_id, category_id, in_pnl,
     counterparty_kind, counterparty_name, note, source_doc_kind, source_doc_no, source_doc_date, created_by)
  values
    (p_tenant, v_code, v_dir, v_fund, v_amount, v_at, v_kind, v_supplier, v_cat, v_in_pnl,
     v_cp_kind, nullif(btrim(coalesce(p_voucher ->> 'counterparty_name', '')), ''),
     nullif(btrim(coalesce(p_voucher ->> 'note', '')), ''),
     nullif(p_voucher ->> 'source_doc_kind', ''), nullif(btrim(coalesce(p_voucher ->> 'source_doc_no', '')), ''),
     nullif(p_voucher ->> 'source_doc_date', '')::date, v_actor)
  returning cash_vouchers.id into v_id;
  return query select v_id, v_code;
end;
$$;
revoke execute on function public.create_cash_voucher(uuid, jsonb) from public, anon;
grant execute on function public.create_cash_voucher(uuid, jsonb) to authenticated;

-- Hủy = vô hiệu, không xóa (CASH-04). Phiếu tự sinh từ phiếu nhập hủy qua "Hủy bỏ" phiếu nhập (0076).
create or replace function public.cancel_cash_voucher(p_voucher uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.cash_vouchers%rowtype;
  v_actor uuid;
begin
  select * into v from public.cash_vouchers where id = p_voucher for update;
  if not found then
    raise exception 'khong_tim_thay' using errcode = '42501';
  end if;
  v_actor := public.purchasing_actor(v.tenant_id);
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if v.source = 'purchase' then
    raise exception 'huy_tu_phieu_nhap' using errcode = '22023';
  end if;
  if v.status = 'cancelled' then
    raise exception 'da_huy' using errcode = '22023';
  end if;
  update public.cash_vouchers set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now() where id = v.id;
end;
$$;
revoke execute on function public.cancel_cash_voucher(uuid) from public, anon;
grant execute on function public.cancel_cash_voucher(uuid) to authenticated;

-- Sửa phiếu: chỉ ghi chú + thời gian (mọi phiếu). Sai số tiền / loại → hủy rồi lập lại (như Sapo).
create or replace function public.update_cash_voucher_meta(p_voucher uuid, p_note text, p_occurred_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.cash_vouchers%rowtype;
begin
  select * into v from public.cash_vouchers where id = p_voucher for update;
  if not found or public.purchasing_actor(v.tenant_id) is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if v.status <> 'active' then
    raise exception 'da_huy' using errcode = '22023';
  end if;
  if p_occurred_at is not null and p_occurred_at > now() + interval '1 day' then
    raise exception 'ngay_tuong_lai' using errcode = '22023';
  end if;
  update public.cash_vouchers
     set note = nullif(btrim(coalesce(p_note, '')), ''), occurred_at = coalesce(p_occurred_at, occurred_at)
   where id = v.id;
end;
$$;
revoke execute on function public.update_cash_voucher_meta(uuid, text, timestamptz) from public, anon;
grant execute on function public.update_cash_voucher_meta(uuid, text, timestamptz) to authenticated;

-- ---- Sổ quỹ ------------------------------------------------------------------------------------------------------
-- Mọi dòng tiền của quỹ: phiếu (chưa hủy) + tiền bán hàng theo ngày bán × phương thức. p_fund: 'cash' | 'bank' | 'all'.
-- Chỉ chủ / quản lý: người khác nhận 0 dòng (tiền bán hàng đọc được qua RLS của payments nên phải chặn ở đây).
create or replace function public.cashbook_flows(p_tenant uuid, p_fund text, p_from timestamptz, p_to timestamptz)
returns table (
  kind text, voucher_id uuid, code text, occurred_at timestamptz, direction text, fund text, amount bigint, status text,
  source text, category text, counterparty text, note text, sales_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with ok as (
    select p_tenant as t where p_tenant = any (public.manager_tenants(array[p_tenant]))
  )
  select 'voucher', v.id, v.code, v.occurred_at, v.direction, v.fund, v.amount::bigint, v.status, v.source,
         coalesce(c.name, case v.source when 'purchase' then 'Trả tiền phiếu nhập' when 'supplier_payment' then 'Trả nợ nhà cung cấp'
                                         when 'opening' then 'Số dư đầu kỳ' end),
         coalesce(s.name, v.counterparty_name), v.note, null::bigint
  from ok
  join public.cash_vouchers v on v.tenant_id = ok.t
  left join public.cash_categories c on c.id = v.category_id
  left join public.suppliers s on s.id = v.supplier_id
  where (p_fund = 'all' or v.fund = p_fund)
    and v.occurred_at >= p_from and v.occurred_at < p_to
  union all
  -- Tiền bán hàng: MỘT dòng mỗi ngày (giờ VN) mỗi phương thức — cùng điều kiện `report_payments`.
  select 'sales', null, null,
         (date_trunc('day', b.business_at at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'),
         'in', case p.method when 'cash' then 'cash' else 'bank' end, sum(p.amount)::bigint, 'active', 'sales',
         'Thu tiền bán hàng', null, null, count(*)::bigint
  from ok
  join public.payments p on p.tenant_id = ok.t
  join public.bills_revenue b on b.id = p.bill_id
  where b.business_at >= p_from and b.business_at < p_to
    and (p_fund = 'all' or (case p.method when 'cash' then 'cash' else 'bank' end) = p_fund)
  group by 4, 6
$$;
revoke execute on function public.cashbook_flows(uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.cashbook_flows(uuid, text, timestamptz, timestamptz) to authenticated;

-- Quỹ đầu kỳ / tổng thu / tổng chi / tồn quỹ. Đầu kỳ = mọi dòng còn hiệu lực TRƯỚC p_from (phiếu hủy không tính).
create or replace function public.cashbook_summary(p_tenant uuid, p_fund text, p_from timestamptz, p_to timestamptz)
returns table (opening bigint, total_in bigint, total_out bigint, closing bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with f as (
    select occurred_at, direction, amount
    from public.cashbook_flows(p_tenant, p_fund, '-infinity'::timestamptz, p_to)
    where status = 'active'
  ), s as (
    select
      coalesce(sum(case when occurred_at < p_from then (case direction when 'in' then amount else -amount end) end), 0)::bigint as opening,
      coalesce(sum(case when occurred_at >= p_from and direction = 'in' then amount end), 0)::bigint as total_in,
      coalesce(sum(case when occurred_at >= p_from and direction = 'out' then amount end), 0)::bigint as total_out
    from f
  )
  select opening, total_in, total_out, opening + total_in - total_out from s
$$;
revoke execute on function public.cashbook_summary(uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.cashbook_summary(uuid, text, timestamptz, timestamptz) to authenticated;
