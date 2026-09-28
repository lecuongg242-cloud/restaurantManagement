-- 0067_owner_create_branch.sql — Chủ quán TỰ tạo chi nhánh trong admin của quán (chủ dự án 27/09/2026).
--
-- Đối thủ (KiotViet "Tạo chi nhánh", CUKCUK "Thêm nhà hàng", POS365 "Thêm mới chi nhánh") để chủ quán tự thêm chi nhánh
-- ngay trong trang quản trị, không có khu "quản trị chuỗi" riêng. Chủ dự án chốt: tự tạo, không giới hạn số lượng,
-- tính vào lần gia hạn sau (giá gói × số chi nhánh).
--
-- Lần tạo chi nhánh ĐẦU TIÊN: quán hiện tại chưa thuộc thương hiệu nào ⇒ tự lập thương hiệu (tên = tên quán, mã = mã
-- quán), quán hiện tại là chi nhánh gốc, chủ quán thành chủ chuỗi. Sau đó tạo chi nhánh như create_branch (0062):
-- hạn dùng = hạn chung của chuỗi; chuỗi đang không giới hạn → chi nhánh mới có hạn từ hôm nay (không tự mở chi nhánh
-- miễn phí — create_branch đã làm đúng vậy khi người gọi không phải super-admin).

create or replace function public.create_my_branch(p_from_tenant uuid, p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t      public.tenants;
  v_brand  uuid;
  v_slug   text;
  n        int := 1;
begin
  -- Người gọi phải là CHỦ đang hoạt động của quán này, và quán đang dùng được (không khóa / hết hạn).
  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_from_tenant and m.user_id = auth.uid() and m.role = 'owner' and m.active
      and m.tenant_id in (select public.auth_tenant_ids())
  ) then
    raise exception 'chi chu quan moi tao duoc chi nhanh' using errcode = '42501';
  end if;

  select * into v_t from public.tenants where id = p_from_tenant for update;
  v_brand := v_t.brand_id;

  if v_brand is null then
    v_slug := v_t.slug;
    while exists (select 1 from public.brands where slug = v_slug) loop
      n := n + 1;
      v_slug := v_t.slug || '-' || n;
    end loop;
    insert into public.brands (name, slug, logo_url, root_tenant_id)
    values (v_t.name, v_slug, v_t.logo_url, v_t.id)
    returning id into v_brand;
    update public.tenants set brand_id = v_brand, updated_at = now() where id = v_t.id;
    -- Chủ đang hoạt động của quán gốc thành chủ chuỗi (quyền vốn có ở quán gốc giữ nguyên, brand_id rỗng).
    insert into public.brand_members (brand_id, user_id, role)
    select v_brand, m.user_id, 'owner' from public.memberships m
    where m.tenant_id = v_t.id and m.role = 'owner' and m.active and m.user_id is not null
    on conflict (brand_id, user_id) do nothing;
  elsif not public.is_brand_owner(v_brand) then
    raise exception 'chi chu chuoi moi tao duoc chi nhanh' using errcode = '42501';
  end if;

  return public.create_branch(v_brand, p_name, p_slug, p_from_tenant);
end;
$$;

revoke execute on function public.create_my_branch(uuid, text, text) from public, anon;
grant execute on function public.create_my_branch(uuid, text, text) to authenticated;
