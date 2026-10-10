-- 0088 — Chỉ super-admin đăng ký chuỗi (chủ dự án 10/10/2026: "mục chi nhánh chỉ bật khi super admin đăng kí chuỗi
-- nhà hàng cho bên đó").
--
-- Trước đây (0067) chủ quán lẻ gọi `create_my_branch` là tự lập thương hiệu, quán thành chi nhánh gốc — và vì chuỗi trả
-- giá gói × số chi nhánh (QD-023 D9), một cú bấm là phát sinh phí. Nay: quán CHƯA thuộc thương hiệu → từ chối. Super-admin
-- tạo thương hiệu ở /super/thuong-hieu (service role, không qua hàm này). Quán đã là chuỗi: chủ chuỗi vẫn tự thêm chi
-- nhánh như cũ.

create or replace function public.create_my_branch(p_from_tenant uuid, p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid;
begin
  -- Người gọi phải là CHỦ đang hoạt động của quán này, và quán đang dùng được (không khóa / hết hạn).
  if not exists (
    select 1 from public.memberships m
    where m.tenant_id = p_from_tenant and m.user_id = auth.uid() and m.role = 'owner' and m.active
      and m.tenant_id in (select public.auth_tenant_ids())
  ) then
    raise exception 'chi chu quan moi tao duoc chi nhanh' using errcode = '42501';
  end if;

  select brand_id into v_brand from public.tenants where id = p_from_tenant for update;

  if v_brand is null then
    raise exception 'quan chua dang ky chuoi' using errcode = '42501';
  elsif not public.is_brand_owner(v_brand) then
    raise exception 'chi chu chuoi moi tao duoc chi nhanh' using errcode = '42501';
  end if;

  return public.create_branch(v_brand, p_name, p_slug, p_from_tenant);
end;
$$;
revoke execute on function public.create_my_branch(uuid, text, text) from public, anon;
grant execute on function public.create_my_branch(uuid, text, text) to authenticated;
