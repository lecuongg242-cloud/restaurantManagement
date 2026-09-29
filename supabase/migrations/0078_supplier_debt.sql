-- 0078_supplier_debt.sql — Công nợ nhà cung cấp: thanh toán phân bổ phiếu cũ trước / tích chọn phiếu, điều chỉnh nợ
-- (P20 / plan 20-03, PURCH-05, QD-027 D11).
--
-- Bất biến (test p20-debt): Nợ NCC = Σ cần trả phiếu đã nhập − Σ phiếu chi gắn NCC còn hiệu lực + Σ điều chỉnh còn hiệu lực
--                                   = Σ còn nợ từng phiếu + Σ điều chỉnh − trả trước.
-- Phân bổ do trigger giữ: phiếu chi sinh ra → phân bổ; phiếu chi / phiếu nhập bị hủy → gỡ phân bổ. Không ai ghi thẳng.

create table if not exists public.cash_voucher_allocations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  voucher_id  uuid not null references public.cash_vouchers (id) on delete cascade,
  receipt_id  uuid not null references public.purchase_receipts (id) on delete cascade,
  amount      integer not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (voucher_id, receipt_id)
);
create index if not exists idx_cash_voucher_allocations_receipt on public.cash_voucher_allocations (receipt_id);

create table if not exists public.supplier_debt_adjustments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  supplier_id  uuid not null references public.suppliers (id) on delete restrict,
  amount       integer not null check (amount <> 0),   -- dương = tăng nợ (nợ đầu kỳ), âm = giảm nợ
  note         text null check (note is null or char_length(note) <= 500),
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  created_by   uuid null,
  created_at   timestamptz not null default now(),
  cancelled_by uuid null,
  cancelled_at timestamptz null
);
create index if not exists idx_supplier_debt_adjustments_supplier on public.supplier_debt_adjustments (supplier_id);

alter table public.cash_voucher_allocations enable row level security;
alter table public.supplier_debt_adjustments enable row level security;
drop policy if exists cash_voucher_allocations_read on public.cash_voucher_allocations;
create policy cash_voucher_allocations_read on public.cash_voucher_allocations
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
drop policy if exists supplier_debt_adjustments_read on public.supplier_debt_adjustments;
create policy supplier_debt_adjustments_read on public.supplier_debt_adjustments
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
revoke all on public.cash_voucher_allocations from anon;
revoke all on public.supplier_debt_adjustments from anon;
revoke insert, update, delete on public.cash_voucher_allocations from authenticated;
revoke insert, update, delete on public.supplier_debt_adjustments from authenticated;

-- ---- Phân bổ một phiếu chi vào phiếu nhập của NCC: phiếu cũ trước (doc_date, rồi mã) --------------------------
-- p_receipts rỗng = mọi phiếu đã nhập của NCC; có = chỉ các phiếu được tích. Phần dư sau khi hết phiếu = trả trước.
-- Người gọi phải đã khóa dòng NCC (tuần tự hóa các lần trả cùng NCC).
create or replace function public.allocate_supplier_voucher(p_voucher uuid, p_receipts uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v    public.cash_vouchers%rowtype;
  rem  integer;
  r    record;
  take integer;
begin
  select * into v from public.cash_vouchers where id = p_voucher;
  if not found or v.supplier_id is null or v.direction <> 'out' or v.status <> 'active' then
    return;
  end if;
  rem := v.amount - coalesce((select sum(a.amount) from public.cash_voucher_allocations a where a.voucher_id = v.id), 0);
  for r in
    select pr.id,
           pr.total - coalesce((select sum(a.amount) from public.cash_voucher_allocations a where a.receipt_id = pr.id), 0) as remaining
    from public.purchase_receipts pr
    where pr.tenant_id = v.tenant_id and pr.supplier_id = v.supplier_id and pr.status = 'done'
      and (p_receipts is null or pr.id = any (p_receipts))
    order by pr.doc_date, pr.code
  loop
    exit when rem <= 0;
    take := least(rem, r.remaining);
    if take > 0 then
      insert into public.cash_voucher_allocations (tenant_id, voucher_id, receipt_id, amount)
      values (v.tenant_id, v.id, r.id, take);
      rem := rem - take;
    end if;
  end loop;
end;
$$;
revoke execute on function public.allocate_supplier_voucher(uuid, uuid[]) from public, anon, authenticated;

-- Phiếu chi mới gắn NCC: từ phiếu nhập → vào đúng phiếu đó; lập tay ở sổ quỹ → phiếu cũ trước.
-- (Trả nợ qua pay_supplier tự phân bổ theo lựa chọn của người dùng — trigger bỏ qua nguồn đó.)
create or replace function public.cash_vouchers_allocate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.supplier_id is not null and new.direction = 'out' and new.source in ('purchase', 'manual') then
    perform 1 from public.suppliers s where s.id = new.supplier_id for update;
    perform public.allocate_supplier_voucher(
      new.id, case when new.source = 'purchase' then array[new.purchase_receipt_id] else null end
    );
  end if;
  return null;
end;
$$;
drop trigger if exists trg_cash_vouchers_allocate on public.cash_vouchers;
create trigger trg_cash_vouchers_allocate after insert on public.cash_vouchers
  for each row execute function public.cash_vouchers_allocate();

-- Phiếu chi bị hủy → gỡ phân bổ (tiền trả không còn). Phiếu nhập bị hủy → gỡ phân bổ vào nó (tiền đã trả thành trả trước,
-- trừ khi phiếu chi cũng bị hủy cùng lúc).
create or replace function public.cash_allocations_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if tg_table_name = 'cash_vouchers' then
      delete from public.cash_voucher_allocations where voucher_id = new.id;
    else
      delete from public.cash_voucher_allocations where receipt_id = new.id;
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_cash_vouchers_cancel_alloc on public.cash_vouchers;
create trigger trg_cash_vouchers_cancel_alloc after update of status on public.cash_vouchers
  for each row execute function public.cash_allocations_on_cancel();
drop trigger if exists trg_purchase_receipts_cancel_alloc on public.purchase_receipts;
create trigger trg_purchase_receipts_cancel_alloc after update of status on public.purchase_receipts
  for each row execute function public.cash_allocations_on_cancel();

-- Phiếu chi đã có từ 20-01 / 20-02 → phân bổ ngay (cùng luật với trigger).
do $$
declare
  v record;
begin
  for v in
    select cv.id, cv.source, cv.purchase_receipt_id
    from public.cash_vouchers cv
    where cv.supplier_id is not null and cv.direction = 'out' and cv.status = 'active' and cv.source in ('purchase', 'manual')
      and not exists (select 1 from public.cash_voucher_allocations a where a.voucher_id = cv.id)
    order by cv.occurred_at, cv.code
  loop
    perform public.allocate_supplier_voucher(v.id, case when v.source = 'purchase' then array[v.purchase_receipt_id] else null end);
  end loop;
end;
$$;

-- ---- Thanh toán nợ NCC ------------------------------------------------------------------------------------------
create or replace function public.pay_supplier(
  p_supplier uuid, p_amount integer, p_fund text, p_at timestamptz, p_receipts uuid[], p_note text
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  s       public.suppliers%rowtype;
  v_actor uuid;
  v_id    uuid;
  v_code  text;
begin
  select * into s from public.suppliers where suppliers.id = p_supplier for update;
  if not found then
    raise exception 'khong_tim_thay' using errcode = '42501';
  end if;
  v_actor := public.purchasing_actor(s.tenant_id);
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'so_tien_khong_hop_le' using errcode = '22023';
  end if;
  if p_fund not in ('cash', 'bank') then
    raise exception 'phieu_khong_hop_le' using errcode = '22023';
  end if;
  if p_at is not null and p_at > now() + interval '1 day' then
    raise exception 'ngay_tuong_lai' using errcode = '22023';
  end if;
  -- Phiếu tích chọn phải là phiếu ĐÃ NHẬP của chính NCC này.
  if p_receipts is not null and exists (
    select 1 from unnest(p_receipts) x(rid)
    where not exists (
      select 1 from public.purchase_receipts pr
      where pr.id = x.rid and pr.supplier_id = s.id and pr.tenant_id = s.tenant_id and pr.status = 'done'
    )
  ) then
    raise exception 'phieu_khong_hop_le' using errcode = '22023';
  end if;

  v_code := public.next_doc_code(s.tenant_id, 'pc');
  insert into public.cash_vouchers
    (tenant_id, code, direction, fund, amount, occurred_at, source, supplier_id, counterparty_kind, in_pnl, note, created_by)
  values
    (s.tenant_id, v_code, 'out', p_fund, p_amount, coalesce(p_at, now()), 'supplier_payment', s.id, 'supplier', false,
     coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Trả nợ ' || s.name), v_actor)
  returning cash_vouchers.id into v_id;
  perform public.allocate_supplier_voucher(v_id, case when cardinality(p_receipts) > 0 then p_receipts else null end);
  return query select v_id, v_code;
end;
$$;
revoke execute on function public.pay_supplier(uuid, integer, text, timestamptz, uuid[], text) from public, anon;
grant execute on function public.pay_supplier(uuid, integer, text, timestamptz, uuid[], text) to authenticated;

-- ---- Điều chỉnh nợ (KiotViet "Điều chỉnh"): nợ đầu kỳ / sửa lệch — không đi qua quỹ ------------------------------
create or replace function public.adjust_supplier_debt(p_supplier uuid, p_amount integer, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.suppliers%rowtype;
  v_actor uuid;
  v_id    uuid;
begin
  select * into s from public.suppliers where id = p_supplier for update;
  if not found then
    raise exception 'khong_tim_thay' using errcode = '42501';
  end if;
  v_actor := public.purchasing_actor(s.tenant_id);
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'so_tien_khong_hop_le' using errcode = '22023';
  end if;
  insert into public.supplier_debt_adjustments (tenant_id, supplier_id, amount, note, created_by)
  values (s.tenant_id, s.id, p_amount, nullif(btrim(coalesce(p_note, '')), ''), v_actor)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.adjust_supplier_debt(uuid, integer, text) from public, anon;
grant execute on function public.adjust_supplier_debt(uuid, integer, text) to authenticated;

create or replace function public.cancel_supplier_adjustment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a       public.supplier_debt_adjustments%rowtype;
  v_actor uuid;
begin
  select * into a from public.supplier_debt_adjustments where id = p_id for update;
  if not found then
    raise exception 'khong_tim_thay' using errcode = '42501';
  end if;
  v_actor := public.purchasing_actor(a.tenant_id);
  if v_actor is null then
    raise exception 'khong du quyen' using errcode = '42501';
  end if;
  if a.status = 'cancelled' then
    raise exception 'da_huy' using errcode = '22023';
  end if;
  update public.supplier_debt_adjustments set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now() where id = a.id;
end;
$$;
revoke execute on function public.cancel_supplier_adjustment(uuid) from public, anon;
grant execute on function public.cancel_supplier_adjustment(uuid) to authenticated;

-- ---- Đọc nợ -----------------------------------------------------------------------------------------------------
-- Thay bản 0076: thêm điều chỉnh. Cùng chữ ký ⇒ app không đổi.
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
  ), dc as (
    select d.supplier_id, sum(d.amount)::bigint as adj
    from public.supplier_debt_adjustments d
    where d.tenant_id = p_tenant and d.status = 'active'
    group by 1
  )
  select s.id, coalesce(m.total_purchase, 0), coalesce(t.paid, 0),
         coalesce(m.total_purchase, 0) - coalesce(t.paid, 0) + coalesce(d.adj, 0)
  from public.suppliers s
  left join mua m on m.supplier_id = s.id
  left join tra t on t.supplier_id = s.id
  left join dc d on d.supplier_id = s.id
  where s.tenant_id = p_tenant
$$;

-- Nợ từng phiếu của một NCC: cần trả, đã trả (phân bổ), còn nợ. Phiếu cũ trước.
create or replace function public.supplier_receipt_balances(p_supplier uuid)
returns table (receipt_id uuid, code text, doc_date date, total integer, paid bigint, remaining bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select pr.id, pr.code, pr.doc_date, pr.total,
         coalesce(sum(a.amount), 0)::bigint,
         (pr.total - coalesce(sum(a.amount), 0))::bigint
  from public.purchase_receipts pr
  left join public.cash_voucher_allocations a on a.receipt_id = pr.id
  where pr.supplier_id = p_supplier and pr.status = 'done'
  group by pr.id
  order by pr.doc_date, pr.code
$$;
revoke execute on function public.supplier_receipt_balances(uuid) from public, anon;
grant execute on function public.supplier_receipt_balances(uuid) to authenticated;
