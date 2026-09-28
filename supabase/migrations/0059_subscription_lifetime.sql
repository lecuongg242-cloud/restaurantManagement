-- 0059_subscription_lifetime.sql — Ghi nhận gia hạn ở /super: thêm "chọn ngày hết hạn" và gói VĨNH VIỄN
-- (chủ dự án 27/09/2026, sau 13-04).
--
--  • Chọn ngày: super-admin chọn thẳng ngày hết hạn mới trên lịch (thỏa thuận riêng với quán, không tròn tháng).
--    Nhật ký ghi `paid_until_after` = ngày đó, `months` rỗng.
--  • Vĩnh viễn (mua đứt): quán thành KHÔNG GIỚI HẠN (`paid_until` rỗng, như qt-food). Nhật ký `lifetime = true`,
--    không có số tháng, không có hạn mới.
-- Cả hai đổi `tenants.paid_until` và ghi nhật ký TRONG MỘT GIAO DỊCH, chỉ super-admin. RPC cũ
-- `record_subscription_payment` giữ nguyên chữ ký và hành vi (không overload).

alter table public.subscription_payments
  add column if not exists lifetime boolean not null default false;
alter table public.subscription_payments alter column months drop not null;
alter table public.subscription_payments alter column paid_until_after drop not null;

alter table public.subscription_payments drop constraint if exists subscription_payments_kind_check;
alter table public.subscription_payments add constraint subscription_payments_kind_check check (
  (lifetime and months is null and paid_until_after is null)
  or (not lifetime and paid_until_after is not null)
);

-- Đặt hạn tới đúng ngày `p_until`. Chỉ cho KÉO DÀI: ngày chọn phải sau hôm nay (giờ VN, đổi ngày 04:00) và
-- sau hạn hiện tại — rút ngắn hạn là việc "Sửa hạn tay" có ghi lý do, không phải ghi nhận tiền.
create or replace function public.record_subscription_until(
  p_tenant uuid,
  p_until date,
  p_amount integer,
  p_note text default null,
  p_start_limited boolean default false
)
returns public.subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before date;
  v_today  date := ((now() at time zone 'Asia/Ho_Chi_Minh') - interval '4 hours')::date;
  v_row    public.subscription_payments;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin moi ghi nhan gia han' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'so tien khong duoc am' using errcode = '22023';
  end if;
  if p_until is null or p_until <= v_today then
    raise exception 'ngay het han phai sau hom nay' using errcode = '22023';
  end if;

  select paid_until into v_before from public.tenants where id = p_tenant for update;
  if not found then
    raise exception 'khong tim thay nha hang' using errcode = 'P0002';
  end if;
  if v_before is null and not coalesce(p_start_limited, false) then
    raise exception 'nha hang dang KHONG GIOI HAN - bat "chuyen sang co han" neu that su muon' using errcode = '22023';
  end if;
  if v_before is not null and p_until <= v_before then
    raise exception 'ngay chon phai sau han hien tai (rut ngan han: dung Sua han tay)' using errcode = '22023';
  end if;

  update public.tenants set paid_until = p_until, updated_at = now() where id = p_tenant;

  insert into public.subscription_payments
    (tenant_id, lifetime, months, amount, paid_until_before, paid_until_after, recorded_by, note)
  values
    (p_tenant, false, null, p_amount, v_before, p_until, auth.uid(), nullif(btrim(p_note), ''))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.record_subscription_lifetime(
  p_tenant uuid,
  p_amount integer,
  p_note text default null
)
returns public.subscription_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before date;
  v_row    public.subscription_payments;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin moi ghi nhan gia han' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'so tien khong duoc am' using errcode = '22023';
  end if;

  select paid_until into v_before from public.tenants where id = p_tenant for update;
  if not found then
    raise exception 'khong tim thay nha hang' using errcode = 'P0002';
  end if;

  update public.tenants set paid_until = null, updated_at = now() where id = p_tenant;

  insert into public.subscription_payments
    (tenant_id, lifetime, months, amount, paid_until_before, paid_until_after, recorded_by, note)
  values
    (p_tenant, true, null, p_amount, v_before, null, auth.uid(), nullif(btrim(p_note), ''))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.record_subscription_until(uuid, date, integer, text, boolean) from public, anon;
grant execute on function public.record_subscription_until(uuid, date, integer, text, boolean) to authenticated;
revoke execute on function public.record_subscription_lifetime(uuid, integer, text) from public, anon;
grant execute on function public.record_subscription_lifetime(uuid, integer, text) to authenticated;
