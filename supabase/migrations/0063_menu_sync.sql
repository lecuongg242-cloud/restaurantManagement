-- 0063_menu_sync.sql — Đồng bộ thực đơn từ chi nhánh gốc (P15 / plan 15-03, QD-023 D4, U2).
--
-- Chi nhánh gốc (brands.root_tenant_id) giữ thực đơn chuẩn. Mỗi dòng ở chi nhánh khác nối về dòng gốc bằng
-- `source_id` (= id dòng ở chi nhánh gốc). Đồng bộ = thêm / sửa / ẩn theo `source_id` — KHÔNG xóa (order cũ
-- còn tham chiếu), KHÔNG đổi id (định lượng P10 gắn menu_item_id), KHÔNG đụng `is_available` (hết món) của
-- dòng đã có, và KHÔNG ghi đè giá món chi nhánh đã tự sửa (`price_locked`, U2).
--
-- Món/nhóm chỉ có ở chi nhánh (source_id rỗng) không bị đụng. Lần đầu, dòng có sẵn cùng tên được NỐI (người
-- dùng xác nhận từng cặp ở bước xem trước → tham số p_pairs) thay vì sinh bản trùng.
--
-- Xem trước tính ở TS (lib/brand/menu-sync.ts, thuần); áp dụng ở đây trong MỘT giao dịch mỗi chi nhánh. Test
-- "đồng bộ xong xem trước lại = không còn gì" giữ hai phía cùng quy tắc.

alter table public.menu_categories add column if not exists source_id uuid null;
alter table public.menu_items add column if not exists source_id uuid null;
alter table public.menu_items add column if not exists price_locked boolean not null default false;
alter table public.modifier_groups add column if not exists source_id uuid null;
alter table public.modifier_options add column if not exists source_id uuid null;

create unique index if not exists uniq_menu_categories_source on public.menu_categories (tenant_id, source_id) where source_id is not null;
create unique index if not exists uniq_menu_items_source on public.menu_items (tenant_id, source_id) where source_id is not null;
create unique index if not exists uniq_modifier_groups_source on public.modifier_groups (tenant_id, source_id) where source_id is not null;
create unique index if not exists uniq_modifier_options_source on public.modifier_options (tenant_id, source_id) where source_id is not null;

create or replace function public.sync_menu_from_root(p_target uuid, p_pairs jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid;
  v_root  uuid;
  v_them  int := 0;
  v_sua   int := 0;
  v_an    int := 0;
  n       int;
  p       jsonb;
begin
  select t.brand_id, b.root_tenant_id into v_brand, v_root
  from public.tenants t join public.brands b on b.id = t.brand_id
  where t.id = p_target;
  if v_brand is null then raise exception 'chi nhanh khong thuoc thuong hieu' using errcode = '22023'; end if;
  if not (public.is_super_admin() or public.is_brand_owner(v_brand)) then
    raise exception 'chi chu thuong hieu' using errcode = '42501';
  end if;
  if v_root is null or v_root = p_target then raise exception 'khong co chi nhanh goc khac' using errcode = '22023'; end if;

  -- 0) Nối lần đầu: [{kind, branch_id, root_id}] — chỉ nối dòng chưa có source_id, đúng chi nhánh / đúng gốc.
  for p in select * from jsonb_array_elements(coalesce(p_pairs, '[]'::jsonb)) loop
    if p->>'kind' = 'category' then
      update public.menu_categories set source_id = (p->>'root_id')::uuid
      where id = (p->>'branch_id')::uuid and tenant_id = p_target and source_id is null
        and exists (select 1 from public.menu_categories r where r.id = (p->>'root_id')::uuid and r.tenant_id = v_root);
    elsif p->>'kind' = 'item' then
      update public.menu_items set source_id = (p->>'root_id')::uuid
      where id = (p->>'branch_id')::uuid and tenant_id = p_target and source_id is null
        and exists (select 1 from public.menu_items r where r.id = (p->>'root_id')::uuid and r.tenant_id = v_root);
    elsif p->>'kind' = 'group' then
      update public.modifier_groups set source_id = (p->>'root_id')::uuid
      where id = (p->>'branch_id')::uuid and tenant_id = p_target and source_id is null
        and exists (select 1 from public.modifier_groups r where r.id = (p->>'root_id')::uuid and r.tenant_id = v_root);
    end if;
  end loop;

  -- 1) Nhóm món
  insert into public.menu_categories (tenant_id, name, sort_order, active, source_id)
  select p_target, r.name, r.sort_order, r.active, r.id from public.menu_categories r
  where r.tenant_id = v_root
    and not exists (select 1 from public.menu_categories b where b.tenant_id = p_target and b.source_id = r.id);
  get diagnostics n = row_count; v_them := v_them + n;

  update public.menu_categories b set name = r.name, sort_order = r.sort_order, active = r.active, updated_at = now()
  from public.menu_categories r
  where b.tenant_id = p_target and r.tenant_id = v_root and b.source_id = r.id
    and (b.name, b.sort_order, b.active) is distinct from (r.name, r.sort_order, r.active);
  get diagnostics n = row_count; v_sua := v_sua + n;

  update public.menu_categories b set active = false, updated_at = now()
  where b.tenant_id = p_target and b.source_id is not null and b.active
    and not exists (select 1 from public.menu_categories r where r.tenant_id = v_root and r.id = b.source_id);
  get diagnostics n = row_count; v_an := v_an + n;

  -- 2) Nhóm tùy chọn (không có cột ẩn — nhóm bị xóa ở gốc chỉ bị gỡ khỏi món ở bước 5)
  insert into public.modifier_groups (tenant_id, name, min_select, max_select, required, sort_order, source_id)
  select p_target, r.name, r.min_select, r.max_select, r.required, r.sort_order, r.id from public.modifier_groups r
  where r.tenant_id = v_root
    and not exists (select 1 from public.modifier_groups b where b.tenant_id = p_target and b.source_id = r.id);
  get diagnostics n = row_count; v_them := v_them + n;

  update public.modifier_groups b
  set name = r.name, min_select = r.min_select, max_select = r.max_select, required = r.required,
      sort_order = r.sort_order, updated_at = now()
  from public.modifier_groups r
  where b.tenant_id = p_target and r.tenant_id = v_root and b.source_id = r.id
    and (b.name, b.min_select, b.max_select, b.required, b.sort_order)
        is distinct from (r.name, r.min_select, r.max_select, r.required, r.sort_order);
  get diagnostics n = row_count; v_sua := v_sua + n;

  -- 3) Tùy chọn (giá cộng thêm theo gốc; hết/còn giữ của chi nhánh; bị xóa ở gốc → tắt)
  insert into public.modifier_options (tenant_id, group_id, name, price_delta, sort_order, is_available, source_id)
  select p_target, bg.id, r.name, r.price_delta, r.sort_order, true, r.id
  from public.modifier_options r
  join public.modifier_groups bg on bg.tenant_id = p_target and bg.source_id = r.group_id
  where r.tenant_id = v_root
    and not exists (select 1 from public.modifier_options b where b.tenant_id = p_target and b.source_id = r.id);
  get diagnostics n = row_count; v_them := v_them + n;

  update public.modifier_options b set name = r.name, price_delta = r.price_delta, sort_order = r.sort_order, group_id = bg.id
  from public.modifier_options r
  join public.modifier_groups bg on bg.tenant_id = p_target and bg.source_id = r.group_id
  where b.tenant_id = p_target and r.tenant_id = v_root and b.source_id = r.id
    and (b.name, b.price_delta, b.sort_order, b.group_id) is distinct from (r.name, r.price_delta, r.sort_order, bg.id);
  get diagnostics n = row_count; v_sua := v_sua + n;

  update public.modifier_options b set is_available = false
  where b.tenant_id = p_target and b.source_id is not null and b.is_available
    and not exists (select 1 from public.modifier_options r where r.tenant_id = v_root and r.id = b.source_id);
  get diagnostics n = row_count; v_an := v_an + n;

  -- 4) Món (giá chỉ khi chi nhánh chưa khóa giá; hết món giữ nguyên; món mới thì còn món)
  insert into public.menu_items
    (tenant_id, category_id, name, description, base_price, image_url, is_available, sort_order, active, source_id)
  select p_target, bc.id, r.name, r.description, r.base_price, r.image_url, true, r.sort_order, r.active, r.id
  from public.menu_items r
  join public.menu_categories bc on bc.tenant_id = p_target and bc.source_id = r.category_id
  where r.tenant_id = v_root
    and not exists (select 1 from public.menu_items b where b.tenant_id = p_target and b.source_id = r.id);
  get diagnostics n = row_count; v_them := v_them + n;

  update public.menu_items b
  set name = r.name, description = r.description, image_url = r.image_url, sort_order = r.sort_order,
      active = r.active, category_id = bc.id,
      base_price = case when b.price_locked then b.base_price else r.base_price end,
      updated_at = now()
  from public.menu_items r
  join public.menu_categories bc on bc.tenant_id = p_target and bc.source_id = r.category_id
  where b.tenant_id = p_target and r.tenant_id = v_root and b.source_id = r.id
    and (b.name, b.description, b.image_url, b.sort_order, b.active, b.category_id,
         case when b.price_locked then b.base_price else r.base_price end)
        is distinct from (r.name, r.description, r.image_url, r.sort_order, r.active, bc.id, b.base_price);
  get diagnostics n = row_count; v_sua := v_sua + n;

  update public.menu_items b set active = false, updated_at = now()
  where b.tenant_id = p_target and b.source_id is not null and b.active
    and not exists (select 1 from public.menu_items r where r.tenant_id = v_root and r.id = b.source_id);
  get diagnostics n = row_count; v_an := v_an + n;

  -- 5) Gắn nhóm tùy chọn vào món — chỉ các cặp mà CẢ HAI đầu đều nối về gốc.
  insert into public.menu_item_modifier_groups (item_id, group_id, tenant_id, sort_order)
  select bi.id, bg.id, p_target, rl.sort_order
  from public.menu_item_modifier_groups rl
  join public.menu_items bi on bi.tenant_id = p_target and bi.source_id = rl.item_id
  join public.modifier_groups bg on bg.tenant_id = p_target and bg.source_id = rl.group_id
  where rl.tenant_id = v_root
  on conflict (item_id, group_id) do update set sort_order = excluded.sort_order
    where public.menu_item_modifier_groups.sort_order is distinct from excluded.sort_order;
  get diagnostics n = row_count; v_them := v_them + n;

  delete from public.menu_item_modifier_groups l
  using public.menu_items bi, public.modifier_groups bg
  where l.tenant_id = p_target and bi.id = l.item_id and bg.id = l.group_id
    and bi.source_id is not null and bg.source_id is not null
    and not exists (
      select 1 from public.menu_item_modifier_groups rl
      where rl.tenant_id = v_root and rl.item_id = bi.source_id and rl.group_id = bg.source_id
    );
  get diagnostics n = row_count; v_an := v_an + n;

  return jsonb_build_object('them', v_them, 'sua', v_sua, 'an', v_an);
end;
$$;

-- "Theo giá chuỗi": bỏ khóa giá một món của chi nhánh và lấy lại giá gốc ngay. Người đang quản chi nhánh đó.
create or replace function public.unlock_item_price(p_item uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_gia integer;
begin
  if not exists (select 1 from public.menu_items where id = p_item and tenant_id in (select public.auth_tenant_ids())) then
    raise exception 'khong co quyen' using errcode = '42501';
  end if;
  select r.base_price into v_gia from public.menu_items b join public.menu_items r on r.id = b.source_id where b.id = p_item;
  update public.menu_items
  set price_locked = false, base_price = coalesce(v_gia, base_price), updated_at = now()
  where id = p_item;
  return v_gia;
end;
$$;

revoke execute on function public.sync_menu_from_root(uuid, jsonb) from public, anon;
grant execute on function public.sync_menu_from_root(uuid, jsonb) to authenticated;
revoke execute on function public.unlock_item_price(uuid) from public, anon;
grant execute on function public.unlock_item_price(uuid) to authenticated;
