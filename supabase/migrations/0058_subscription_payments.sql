-- 0058_subscription_payments.sql — Nhật ký gia hạn thuê bao + RPC ghi nhận (P13 / plan 13-04, QD-021 D8).
--
-- Luồng: chủ quán chuyển khoản tới tài khoản nền tảng (QR trên /admin/gia-han) → super-admin thấy tiền
-- về → bấm "Ghi nhận gia hạn" ở /super → RPC dưới đây cộng `tenants.paid_until` VÀ ghi một dòng nhật ký
-- TRONG MỘT GIAO DỊCH. Quán đang bị khóa (0057) mở lại ngay vì auth_tenant_ids() đọc paid_until mới.
--
-- Nhật ký CHỈ THÊM: không policy update/delete. Ghi nhận nhầm → sửa paid_until tay ở /super + ghi chú
-- lý do (không có dòng "tháng âm").

create table if not exists public.subscription_payments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  months            integer not null check (months > 0),
  amount            integer not null check (amount >= 0),
  paid_until_before date null,
  paid_until_after  date not null,
  recorded_by       uuid null,
  recorded_at       timestamptz not null default now(),
  note              text null check (note is null or char_length(note) <= 500)
);

create index if not exists idx_subscription_payments_tenant
  on public.subscription_payments (tenant_id, recorded_at desc);

alter table public.subscription_payments enable row level security;

-- Đọc: super-admin mọi quán; OWNER (không phải manager/thu ngân) chỉ quán của mình. Đi qua
-- auth_tenant_ids() như mọi bảng khác ⇒ quán bị khóa thì phiên thường không đọc được — trang Gia hạn
-- đọc bằng service-role sau khi tự kiểm owner (lib/tenant/renewal.ts), không mở lỗ RLS.
drop policy if exists subscription_payments_read on public.subscription_payments;
create policy subscription_payments_read on public.subscription_payments
  for select
  using (
    public.is_super_admin()
    or (
      tenant_id in (select public.auth_tenant_ids())
      and exists (
        select 1 from public.memberships m
        where m.tenant_id = subscription_payments.tenant_id
          and m.user_id = auth.uid()
          and m.active
          and m.role = 'owner'
      )
    )
  );

-- Không ai ghi trực tiếp — kể cả super-admin qua phiên: chỉ qua RPC (cộng hạn + nhật ký cùng lúc).
revoke insert, update, delete on public.subscription_payments from anon, authenticated;

create or replace function public.record_subscription_payment(
  p_tenant uuid,
  p_months integer,
  p_amount integer,
  p_note text default null,
  -- `paid_until` rỗng = KHÔNG GIỚI HẠN (qt-food, quán demo). Bấm nhầm "ghi nhận" cho quán đó sẽ biến nó
  -- thành có hạn ⇒ từ chối, trừ khi super-admin chủ động bật cờ này.
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
  v_after  date;
  v_row    public.subscription_payments;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin moi ghi nhan gia han' using errcode = '42501';
  end if;
  if p_months is null or p_months <= 0 then
    raise exception 'so thang phai > 0' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'so tien khong duoc am' using errcode = '22023';
  end if;

  select paid_until into v_before from public.tenants where id = p_tenant for update;
  if not found then
    raise exception 'khong tim thay nha hang' using errcode = 'P0002';
  end if;
  if v_before is null and not coalesce(p_start_limited, false) then
    raise exception 'nha hang dang KHONG GIOI HAN - bat "chuyen sang co han" neu that su muon' using errcode = '22023';
  end if;

  -- Cộng từ hạn cũ nếu còn hạn, từ hôm nay nếu đã quá. `date + interval 'n months'`: 31/01 + 1 tháng
  -- = 28/02 (lùi về cuối tháng) — khớp congThang() trong lib/tenant/subscription.ts.
  v_after := (greatest(v_today, coalesce(v_before, v_today)) + make_interval(months => p_months))::date;

  update public.tenants set paid_until = v_after, updated_at = now() where id = p_tenant;

  insert into public.subscription_payments
    (tenant_id, months, amount, paid_until_before, paid_until_after, recorded_by, note)
  values
    (p_tenant, p_months, p_amount, v_before, v_after, auth.uid(), nullif(btrim(p_note), ''))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.record_subscription_payment(uuid, integer, integer, text, boolean) from public, anon;
grant execute on function public.record_subscription_payment(uuid, integer, integer, text, boolean) to authenticated;
