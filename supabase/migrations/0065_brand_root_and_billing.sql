-- 0065_brand_root_and_billing.sql — P15: chọn chi nhánh gốc (15-03) + thuê bao theo thương hiệu (15-07).
--
-- THUÊ BAO CHUỖI (QD-023 D8–D12, chốt 27/09/2026): thương hiệu là MỘT tài khoản thanh toán — một lần chuyển
-- khoản, một dòng nhật ký, mọi chi nhánh ĐANG HOẠT ĐỘNG cùng một ngày hết hạn. Số tiền = giá gói × số chi nhánh
-- đang hoạt động, không giảm (U1) — tính ở app (lib/brand/billing.ts), RPC chỉ ghi nhận số super-admin nhập.
-- Kỹ thuật (D12): vẫn đặt `paid_until` trên TỪNG tenant ⇒ cổng khóa auth_tenant_ids() (0057) không đổi.

-- Chủ thương hiệu tự đổi chi nhánh gốc (thực đơn chuẩn). Chi nhánh phải thuộc đúng thương hiệu.
create or replace function public.set_brand_root(p_brand uuid, p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_super_admin() or public.is_brand_owner(p_brand)) then
    raise exception 'chi chu thuong hieu' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant and brand_id = p_brand) then
    raise exception 'chi nhanh khong thuoc thuong hieu' using errcode = '22023';
  end if;
  update public.brands set root_tenant_id = p_tenant where id = p_brand;
end;
$$;

-- Nhật ký gia hạn của thương hiệu: một dòng mang brand_id (tenant_id = chi nhánh gốc để cột bắt buộc có giá trị
-- và owner chi nhánh gốc đọc được qua policy cũ).
alter table public.subscription_payments add column if not exists brand_id uuid null references public.brands (id) on delete set null;
create index if not exists idx_subscription_payments_brand on public.subscription_payments (brand_id, recorded_at desc) where brand_id is not null;

-- Chủ thương hiệu đọc được mọi dòng nhật ký của thương hiệu mình (quản lý / thu ngân không).
drop policy if exists subscription_payments_brand_owner_read on public.subscription_payments;
create policy subscription_payments_brand_owner_read on public.subscription_payments
  for select using (brand_id is not null and public.is_brand_owner(brand_id));

-- Ghi nhận gia hạn cho CẢ thương hiệu. Chỉ super-admin. Một giao dịch.
--   p_months > 0  → hạn chung mới = max(hôm nay VN, hạn muộn nhất của các chi nhánh đang hoạt động) + p_months.
--   p_months null → VĨNH VIỄN: mọi chi nhánh đang hoạt động thành không giới hạn.
--   Chi nhánh `suspended` (đã tắt) không bị đụng, không tính tiền.
--   Có chi nhánh đang KHÔNG GIỚI HẠN mà không bật p_start_limited → từ chối (như 0058, bảo vệ quán như qt-food).
create or replace function public.record_brand_subscription_payment(
  p_brand uuid,
  p_months integer,
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
  v_today  date := ((now() at time zone 'Asia/Ho_Chi_Minh') - interval '4 hours')::date;
  v_root   uuid;
  v_max    date;
  v_null   boolean;
  v_count  int;
  v_after  date;
  v_row    public.subscription_payments;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin moi ghi nhan gia han' using errcode = '42501';
  end if;
  if p_months is not null and p_months <= 0 then
    raise exception 'so thang phai > 0' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'so tien khong duoc am' using errcode = '22023';
  end if;

  -- Khóa mọi chi nhánh của thương hiệu trong lúc tính hạn chung.
  perform 1 from public.tenants where brand_id = p_brand for update;
  select count(*), max(paid_until), bool_or(paid_until is null)
    into v_count, v_max, v_null
  from public.tenants where brand_id = p_brand and status = 'active';
  if v_count = 0 then
    raise exception 'thuong hieu khong co chi nhanh dang hoat dong' using errcode = '22023';
  end if;
  if p_months is not null and v_null and not coalesce(p_start_limited, false) then
    raise exception 'co chi nhanh dang KHONG GIOI HAN - bat "chuyen sang co han" neu that su muon' using errcode = '22023';
  end if;

  select coalesce(root_tenant_id, (select id from public.tenants where brand_id = p_brand order by created_at limit 1))
    into v_root from public.brands where id = p_brand;

  if p_months is null then
    v_after := null;
  else
    v_after := (greatest(v_today, coalesce(v_max, v_today)) + make_interval(months => p_months))::date;
  end if;

  update public.tenants set paid_until = v_after, updated_at = now() where brand_id = p_brand and status = 'active';

  insert into public.subscription_payments
    (tenant_id, brand_id, lifetime, months, amount, paid_until_before, paid_until_after, recorded_by, note)
  values
    (v_root, p_brand, p_months is null, p_months, p_amount, v_max, v_after, auth.uid(),
     nullif(btrim(concat_ws(' · ', 'Chuỗi ' || v_count || ' chi nhánh', nullif(btrim(p_note), ''))), ''))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.set_brand_root(uuid, uuid) from public, anon;
grant execute on function public.set_brand_root(uuid, uuid) to authenticated;
revoke execute on function public.record_brand_subscription_payment(uuid, integer, integer, text, boolean) from public, anon;
grant execute on function public.record_brand_subscription_payment(uuid, integer, integer, text, boolean) to authenticated;
