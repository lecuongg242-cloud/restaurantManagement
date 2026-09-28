-- 0066_brand_detach.sql — Gỡ quán khỏi thương hiệu + xóa thương hiệu (chủ dự án 27/09/2026, sau khi gắn nhầm
-- qt-food vào một thương hiệu và phải gỡ tay trong DB).
--
-- Gỡ đúng phải phân biệt hai loại quyền ở một quán: quyền VỐN CÓ (chủ quán trước khi gộp chuỗi) và quyền DO CHUỖI
-- CẤP (sync_brand_memberships thêm cho chủ / quản lý chuỗi). Cột `memberships.brand_id` đánh dấu loại thứ hai; gỡ
-- quán thì xóa đúng các dòng đó, quyền vốn có giữ nguyên.
--
-- Chi nhánh do chuỗi tạo không có chủ riêng: gỡ ra mà xóa hết quyền chuỗi cấp là quán không ai vào được ⇒ khi quán
-- không còn chủ nào đang hoạt động, quyền CHỦ do chuỗi cấp được giữ lại thành quyền thường.
--
-- Thương hiệu tạo trước 0066 không có dòng nào đánh dấu (lúc áp: 0 thương hiệu) — không cần điền ngược.

alter table public.memberships add column if not exists brand_id uuid null references public.brands (id) on delete set null;

-- Như 0062, thêm: dòng MỚI do chuỗi cấp mang brand_id; dòng có sẵn (quyền vốn có) giữ brand_id như cũ.
create or replace function public.sync_brand_memberships(p_brand uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.memberships (tenant_id, user_id, role, display_name, active, brand_id)
  select t.id, bm.user_id, bm.role, coalesce(p.full_name, u.email), true, p_brand
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

-- Bỏ người khỏi thương hiệu: chỉ tắt quyền DO CHUỖI CẤP — quán riêng vốn có của họ vẫn vào được.
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
  update public.memberships set active = false
  where brand_id = p_brand and user_id = p_user and role in ('owner', 'manager');
end;
$$;

-- Thêm / đổi vai thành viên thương hiệu: đổi vai chỉ ở quyền DO CHUỖI CẤP (không hạ chủ quán ở quán riêng của họ).
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
  update public.memberships set role = p_role
  where brand_id = p_brand and user_id = p_user and role in ('owner', 'manager');
  perform public.sync_brand_memberships(p_brand);
end;
$$;

-- Gỡ một quán khỏi thương hiệu. Chỉ super-admin. Một giao dịch.
create or replace function public.detach_tenant_from_brand(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_brand uuid;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin' using errcode = '42501';
  end if;
  select brand_id into v_brand from public.tenants where id = p_tenant for update;
  if not found then raise exception 'khong tim thay nha hang' using errcode = 'P0002'; end if;
  if v_brand is null then return; end if;

  -- Quán không còn chủ riêng nào đang hoạt động (chi nhánh do chuỗi tạo) → giữ quyền CHỦ chuỗi cấp thành quyền thường.
  if not exists (
    select 1 from public.memberships
    where tenant_id = p_tenant and role = 'owner' and active and brand_id is distinct from v_brand
  ) then
    update public.memberships set brand_id = null
    where tenant_id = p_tenant and brand_id = v_brand and role = 'owner' and active;
  end if;

  delete from public.memberships where tenant_id = p_tenant and brand_id = v_brand;
  update public.tenants set brand_id = null, updated_at = now() where id = p_tenant;
  update public.brands set root_tenant_id = (
    select id from public.tenants where brand_id = v_brand order by created_at limit 1
  ) where id = v_brand and root_tenant_id = p_tenant;
end;
$$;

-- Xóa thương hiệu: gỡ mọi quán (như trên) rồi xóa. Chỉ super-admin. Nhật ký gia hạn giữ (brand_id → rỗng).
create or replace function public.delete_brand(p_brand uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not public.is_super_admin() then
    raise exception 'chi super-admin' using errcode = '42501';
  end if;
  for r in select id from public.tenants where brand_id = p_brand loop
    perform public.detach_tenant_from_brand(r.id);
  end loop;
  delete from public.brands where id = p_brand;
end;
$$;

revoke execute on function public.detach_tenant_from_brand(uuid) from public, anon;
revoke execute on function public.delete_brand(uuid) from public, anon;
grant execute on function public.detach_tenant_from_brand(uuid) to authenticated;
grant execute on function public.delete_brand(uuid) to authenticated;
