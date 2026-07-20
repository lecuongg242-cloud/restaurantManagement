-- 0002_menu_tables.sql — Dữ liệu nhà hàng (P2)
-- Bảng: menu_categories, menu_items, menu_option_groups, menu_options, areas, tables
-- Ràng buộc tại database (thiết kế P2 §2): CHECK giá >= 0, composite FK kèm tenant_id
-- để chặn liên kết chéo tenant kể cả khi code chạy service-role.
-- Anon KHÔNG select trực tiếp tables/areas — resolve QR qua RPC resolve_table_by_qr.

-- =====================================================================
-- 0. TENANTS: thông tin hiển thị trên menu khách (onboarding bước 1)
-- =====================================================================

alter table public.tenants
  add column if not exists address text not null default '',
  add column if not exists phone text not null default '';

-- =====================================================================
-- 1. BẢNG
-- =====================================================================

create table public.menu_categories (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id) -- cho composite FK từ menu_items
);

create table public.menu_items (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price integer not null check (price >= 0), -- VND
  image_url text,
  is_active boolean not null default true,   -- chủ quán ẩn món khỏi menu
  is_sold_out boolean not null default false,-- hết món tạm thời (MENU-02)
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, category_id)
    references public.menu_categories (tenant_id, id) on delete cascade
);

create table public.menu_option_groups (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  selection text not null default 'single' check (selection in ('single', 'multiple')),
  is_required boolean not null default false,
  sort int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, item_id)
    references public.menu_items (tenant_id, id) on delete cascade
);

create table public.menu_options (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  price_delta integer not null default 0 check (price_delta >= 0), -- VND phụ thu
  sort int not null default 0,
  foreign key (tenant_id, group_id)
    references public.menu_option_groups (tenant_id, id) on delete cascade
);

create table public.areas (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.tables (
  id uuid not null default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  area_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  qr_token uuid not null unique default gen_random_uuid(),
  -- Trạng thái dùng từ P3 (TABLE-02); P2 chỉ khởi tạo 'available'
  status text not null default 'available' check (status in ('available', 'serving', 'billing')),
  created_at timestamptz not null default now(),
  unique (tenant_id, area_id, name),
  foreign key (tenant_id, area_id)
    references public.areas (tenant_id, id) on delete cascade
);

create index menu_categories_tenant_idx on public.menu_categories (tenant_id, sort);
create index menu_items_tenant_idx on public.menu_items (tenant_id, category_id, sort);
create index menu_option_groups_item_idx on public.menu_option_groups (tenant_id, item_id, sort);
create index menu_options_group_idx on public.menu_options (tenant_id, group_id, sort);
create index areas_tenant_idx on public.areas (tenant_id, sort);
create index tables_tenant_idx on public.tables (tenant_id, area_id);

-- =====================================================================
-- 2. RPC: resolve QR → đúng một bàn (KHÔNG cấp anon select trên tables/areas)
-- =====================================================================

create or replace function public.resolve_table_by_qr(p_qr_token uuid)
returns table (
  table_id uuid,
  table_name text,
  area_name text,
  tenant_slug text,
  tenant_name text
)
language sql stable security definer
set search_path = public
as $$
  select t.id, t.name, a.name, te.slug, te.name
  from tables t
  join areas a on a.tenant_id = t.tenant_id and a.id = t.area_id
  join tenants te on te.id = t.tenant_id
  where t.qr_token = p_qr_token
    and te.status = 'active';
$$;

-- =====================================================================
-- 2b. VIEW CÔNG KHAI: thông tin tenant cho trang menu khách.
-- RLS của bảng tenants GIỮ NGUYÊN (P1) — view security definer chỉ lộ
-- đúng các cột hiển thị công khai, và chỉ tenant đang active.
-- =====================================================================

create view public.tenant_public_info as
  select id, slug, name, logo_url, address, phone
  from public.tenants
  where status = 'active';

grant select on public.tenant_public_info to anon, authenticated;

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_option_groups enable row level security;
alter table public.menu_options enable row level security;
alter table public.areas enable row level security;
alter table public.tables enable row level security;

-- ---- Menu: khách (anon lẫn user đăng nhập) đọc được phần ACTIVE; ----
-- ---- nhân viên tenant đọc tất cả; owner/manager ghi.               ----

create policy "menu_categories_select_public" on public.menu_categories
  for select using (is_active = true);
create policy "menu_categories_select_staff" on public.menu_categories
  for select using (is_super_admin() or tenant_id in (select current_tenant_ids()));
create policy "menu_categories_write" on public.menu_categories
  for all using (is_super_admin() or has_role(tenant_id, array['owner', 'manager']))
  with check (is_super_admin() or has_role(tenant_id, array['owner', 'manager']));

create policy "menu_items_select_public" on public.menu_items
  for select using (is_active = true);
create policy "menu_items_select_staff" on public.menu_items
  for select using (is_super_admin() or tenant_id in (select current_tenant_ids()));
create policy "menu_items_write" on public.menu_items
  for all using (is_super_admin() or has_role(tenant_id, array['owner', 'manager']))
  with check (is_super_admin() or has_role(tenant_id, array['owner', 'manager']));

-- Tùy chọn: công khai khi món cha đang active (thiết kế P2 §2)
create policy "menu_option_groups_select_public" on public.menu_option_groups
  for select using (
    exists (
      select 1 from public.menu_items mi
      where mi.tenant_id = menu_option_groups.tenant_id
        and mi.id = menu_option_groups.item_id
        and mi.is_active = true
    )
  );
create policy "menu_option_groups_select_staff" on public.menu_option_groups
  for select using (is_super_admin() or tenant_id in (select current_tenant_ids()));
create policy "menu_option_groups_write" on public.menu_option_groups
  for all using (is_super_admin() or has_role(tenant_id, array['owner', 'manager']))
  with check (is_super_admin() or has_role(tenant_id, array['owner', 'manager']));

create policy "menu_options_select_public" on public.menu_options
  for select using (
    exists (
      select 1
      from public.menu_option_groups g
      join public.menu_items mi
        on mi.tenant_id = g.tenant_id and mi.id = g.item_id
      where g.tenant_id = menu_options.tenant_id
        and g.id = menu_options.group_id
        and mi.is_active = true
    )
  );
create policy "menu_options_select_staff" on public.menu_options
  for select using (is_super_admin() or tenant_id in (select current_tenant_ids()));
create policy "menu_options_write" on public.menu_options
  for all using (is_super_admin() or has_role(tenant_id, array['owner', 'manager']))
  with check (is_super_admin() or has_role(tenant_id, array['owner', 'manager']));

-- ---- Khu vực & bàn: KHÔNG có policy cho anon (cam kết P2 #8).      ----
-- ---- Nhân viên tenant đọc (POS P3 cần); owner/manager ghi.         ----

create policy "areas_select_staff" on public.areas
  for select using (is_super_admin() or tenant_id in (select current_tenant_ids()));
create policy "areas_write" on public.areas
  for all using (is_super_admin() or has_role(tenant_id, array['owner', 'manager']))
  with check (is_super_admin() or has_role(tenant_id, array['owner', 'manager']));

create policy "tables_select_staff" on public.tables
  for select using (is_super_admin() or tenant_id in (select current_tenant_ids()));
create policy "tables_write" on public.tables
  for all using (is_super_admin() or has_role(tenant_id, array['owner', 'manager']))
  with check (is_super_admin() or has_role(tenant_id, array['owner', 'manager']));

-- =====================================================================
-- 4. REALTIME: app khách nhận thay đổi menu (MENU-02 — hết món ≤ 3s)
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.menu_items;
    alter publication supabase_realtime add table public.menu_categories;
  end if;
end $$;

-- =====================================================================
-- 5. STORAGE: bucket ảnh món — chặn dung lượng/MIME tại CẤU HÌNH BUCKET
--    (cam kết P2 #2), path: {tenant_id}/{item_id}.{ext}
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-images', 'menu-images', true,
  2097152, -- 2MB (MENU-01)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ghi: chỉ owner/manager của tenant, đúng thư mục tenant mình.
-- split_part(name,'/',1) là tenant_id; cast lỗi (path bậy) → từ chối luôn.
create policy "menu_images_insert" on storage.objects
  for insert with check (
    bucket_id = 'menu-images'
    and has_role((split_part(name, '/', 1))::uuid, array['owner', 'manager'])
  );
create policy "menu_images_update" on storage.objects
  for update using (
    bucket_id = 'menu-images'
    and has_role((split_part(name, '/', 1))::uuid, array['owner', 'manager'])
  );
create policy "menu_images_delete" on storage.objects
  for delete using (
    bucket_id = 'menu-images'
    and has_role((split_part(name, '/', 1))::uuid, array['owner', 'manager'])
  );
-- Đọc: bucket public (URL công khai cho menu khách) — không cần policy select.
