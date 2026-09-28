-- 0062_brands.sql — Thương hiệu (chuỗi nhiều chi nhánh) — P15 / plan 15-01, QD-023 D1, D2, D7.
--
-- MÔ HÌNH (D1): mỗi chi nhánh VẪN là một tenant như hiện nay (bàn, nhân viên, máy in, kho, hạn dùng riêng).
-- Thêm tầng `brands` gom các tenant lại + `brand_members` (chủ / quản lý cả chuỗi). Không thêm cột chi nhánh
-- vào bảng vận hành nào; cách ly giữa chi nhánh vẫn do auth_tenant_ids() + RLS như cách ly giữa quán.
--
-- MỘT TÀI KHOẢN CHỦ (D2): quyền vào từng chi nhánh vẫn là một dòng `memberships` — auth_tenant_ids() KHÔNG
-- đổi. `brand_members` chỉ là danh sách để hệ thống tự thêm/gỡ membership ở mọi chi nhánh (hàm
-- sync_brand_memberships dưới đây). Membership do thương hiệu tạo để `email` rỗng: email nhân viên là duy
-- nhất toàn hệ thống (0017), còn chủ chuỗi thì có ở nhiều chi nhánh.
--
-- Nhân viên (D7) mỗi người một chi nhánh — không đổi gì.

create table if not exists public.brands (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null check (char_length(btrim(name)) between 1 and 100),
  logo_url       text null,
  -- Chi nhánh gốc giữ thực đơn chuẩn (D4, 15-03).
  root_tenant_id uuid null references public.tenants (id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.tenants add column if not exists brand_id uuid null references public.brands (id) on delete set null;
create index if not exists idx_tenants_brand on public.tenants (brand_id) where brand_id is not null;

create table if not exists public.brand_members (
  brand_id   uuid not null references public.brands (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);
create index if not exists idx_brand_members_user on public.brand_members (user_id);

-- Thương hiệu của người đang đăng nhập. security definer để policy của brand_members không tự gọi lại chính
-- nó (đệ quy) — cùng kiểu auth_tenant_ids() (0002).
create or replace function public.auth_brand_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select bm.brand_id from public.brand_members bm where bm.user_id = auth.uid()
$$;

create or replace function public.is_brand_owner(p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.brand_members bm
    where bm.brand_id = p_brand and bm.user_id = auth.uid() and bm.role = 'owner'
  )
$$;

alter table public.brands enable row level security;
alter table public.brand_members enable row level security;

drop policy if exists brands_read on public.brands;
create policy brands_read on public.brands
  for select using (id in (select public.auth_brand_ids()) or public.is_super_admin());
drop policy if exists brands_super_write on public.brands;
create policy brands_super_write on public.brands
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists brand_members_read on public.brand_members;
create policy brand_members_read on public.brand_members
  for select using (brand_id in (select public.auth_brand_ids()) or public.is_super_admin());
drop policy if exists brand_members_super_write on public.brand_members;
create policy brand_members_super_write on public.brand_members
  for all using (public.is_super_admin()) with check (public.is_super_admin());

revoke all on public.brands, public.brand_members from anon;

-- Đồng bộ membership: mọi thành viên thương hiệu có membership đang hoạt động ở MỌI chi nhánh, đúng vai.
-- Không hạ vai owner sẵn có của một quán xuống manager. Gọi nội bộ từ các RPC dưới đây.
create or replace function public.sync_brand_memberships(p_brand uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.memberships (tenant_id, user_id, role, display_name, active)
  select t.id, bm.user_id, bm.role, coalesce(p.full_name, u.email), true
  from public.brand_members bm
  join public.tenants t on t.brand_id = bm.brand_id
  join auth.users u on u.id = bm.user_id
  left join public.profiles p on p.id = bm.user_id
  where bm.brand_id = p_brand
  on conflict (tenant_id, user_id) where user_id is not null
  do update set
    active = true,
    role = case when public.memberships.role = 'owner' then 'owner' else excluded.role end
$$;
revoke execute on function public.sync_brand_memberships(uuid) from public, anon, authenticated;

-- Tạo thương hiệu. Chỉ super-admin.
create or replace function public.create_brand(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin' using errcode = '42501';
  end if;
  insert into public.brands (name, slug) values (btrim(p_name), p_slug) returning id into v_id;
  return v_id;
end;
$$;

-- Gắn một quán có sẵn vào thương hiệu. Chủ (owner) đang hoạt động của quán thành chủ thương hiệu; rồi đồng bộ
-- membership để mọi thành viên thương hiệu vào được quán này và ngược lại. Quán đầu tiên thành chi nhánh gốc.
create or replace function public.attach_tenant_to_brand(p_tenant uuid, p_brand uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_cu uuid;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin' using errcode = '42501';
  end if;
  select brand_id into v_cu from public.tenants where id = p_tenant for update;
  if not found then raise exception 'khong tim thay nha hang' using errcode = 'P0002'; end if;
  if v_cu is not null and v_cu <> p_brand then
    raise exception 'nha hang da thuoc thuong hieu khac' using errcode = '22023';
  end if;

  update public.tenants set brand_id = p_brand, updated_at = now() where id = p_tenant;
  update public.brands set root_tenant_id = coalesce(root_tenant_id, p_tenant) where id = p_brand;

  insert into public.brand_members (brand_id, user_id, role)
  select p_brand, m.user_id, 'owner'
  from public.memberships m
  where m.tenant_id = p_tenant and m.role = 'owner' and m.active and m.user_id is not null
  on conflict (brand_id, user_id) do update set role = 'owner';

  perform public.sync_brand_memberships(p_brand);
end;
$$;

-- Tạo chi nhánh mới (tenant mới trong thương hiệu). Super-admin hoặc CHỦ thương hiệu. Một giao dịch.
--  • settings chép từ p_copy_settings_from (mặc định chi nhánh gốc), trừ: onboarding_done = false (chi nhánh
--    mới chưa có bàn/thực đơn — trình hướng dẫn chạy lại), print_mode = browser (chưa có cầu in).
--  • Logo/ảnh bìa chép đường dẫn (không chép file).
--  • Hạn dùng (QD-023 D10): = hạn chung hiện tại (ngày muộn nhất của các chi nhánh đang hoạt động). Chưa chi
--    nhánh nào có hạn: super-admin tạo → không giới hạn như thương hiệu; chủ thương hiệu tự tạo → có hạn từ
--    hôm nay (phải gia hạn), không tự mở chi nhánh miễn phí.
--  • Membership cho mọi thành viên thương hiệu.
create or replace function public.create_branch(
  p_brand uuid,
  p_name text,
  p_slug text,
  p_copy_settings_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src      public.tenants;
  v_id       uuid;
  v_han      date;
  v_today    date := ((now() at time zone 'Asia/Ho_Chi_Minh') - interval '4 hours')::date;
begin
  if not (public.is_super_admin() or public.is_brand_owner(p_brand)) then
    raise exception 'chi super-admin hoac chu thuong hieu' using errcode = '42501';
  end if;
  if not exists (select 1 from public.brands where id = p_brand) then
    raise exception 'khong tim thay thuong hieu' using errcode = 'P0002';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slug khong hop le' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'thieu ten chi nhanh' using errcode = '22023';
  end if;

  select * into v_src from public.tenants
  where id = coalesce(p_copy_settings_from, (select root_tenant_id from public.brands where id = p_brand))
    and brand_id = p_brand;

  select max(paid_until) into v_han
  from public.tenants where brand_id = p_brand and status = 'active' and paid_until is not null;
  if v_han is null and not public.is_super_admin() then
    v_han := v_today;
  end if;

  insert into public.tenants (name, slug, brand_id, settings, logo_url, cover_url, paid_until)
  values (
    btrim(p_name),
    p_slug,
    p_brand,
    coalesce(v_src.settings, '{}'::jsonb) || jsonb_build_object('onboarding_done', false, 'print_mode', 'browser'),
    v_src.logo_url,
    v_src.cover_url,
    v_han
  )
  returning id into v_id;

  perform public.sync_brand_memberships(p_brand);
  return v_id;
end;
$$;

-- Thêm / đổi vai thành viên thương hiệu → có membership ở mọi chi nhánh. Chỉ super-admin.
create or replace function public.set_brand_member(p_brand uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'manager') then
    raise exception 'vai tro khong hop le' using errcode = '22023';
  end if;
  insert into public.brand_members (brand_id, user_id, role) values (p_brand, p_user, p_role)
  on conflict (brand_id, user_id) do update set role = excluded.role;
  -- Đổi vai owner → manager cũng phải hạ ở chi nhánh (sync không tự hạ owner).
  update public.memberships m set role = p_role
  from public.tenants t
  where t.id = m.tenant_id and t.brand_id = p_brand and m.user_id = p_user and m.role in ('owner', 'manager');
  perform public.sync_brand_memberships(p_brand);
end;
$$;

-- Bỏ người khỏi thương hiệu → tắt membership owner/manager của họ ở MỌI chi nhánh. Chỉ super-admin.
create or replace function public.remove_brand_member(p_brand uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin' using errcode = '42501';
  end if;
  delete from public.brand_members where brand_id = p_brand and user_id = p_user;
  update public.memberships m set active = false
  from public.tenants t
  where t.id = m.tenant_id and t.brand_id = p_brand and m.user_id = p_user and m.role in ('owner', 'manager');
end;
$$;

revoke execute on function public.create_brand(text, text) from public, anon;
revoke execute on function public.attach_tenant_to_brand(uuid, uuid) from public, anon;
revoke execute on function public.create_branch(uuid, text, text, uuid) from public, anon;
revoke execute on function public.set_brand_member(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_brand_member(uuid, uuid) from public, anon;
grant execute on function public.create_brand(text, text) to authenticated;
grant execute on function public.attach_tenant_to_brand(uuid, uuid) to authenticated;
grant execute on function public.create_branch(uuid, text, text, uuid) to authenticated;
grant execute on function public.set_brand_member(uuid, uuid, text) to authenticated;
grant execute on function public.remove_brand_member(uuid, uuid) to authenticated;
