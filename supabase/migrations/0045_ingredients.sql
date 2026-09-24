-- 0045_ingredients.sql — Nguyên liệu + định lượng (INV-01..03, QD-017). Plan 10-01.
--
-- CHỈ THÊM BẢNG MỚI. Không đổi cột nào của menu_items / modifier_options / order_items (INV-10):
-- quán chưa khai nguyên liệu thì mọi thứ chạy y như trước.
--
-- Số lượng luôn ở ĐƠN VỊ GỐC (g / ml / cái). Giá luôn là đồng / 1 đơn vị gốc, KHÔNG làm tròn khi
-- lưu (muối 0,15đ/g làm tròn thì thành 0).

create table if not exists public.ingredients (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  name              text not null check (length(btrim(name)) > 0),
  kind              text not null default 'purchased' check (kind in ('purchased', 'prepared')),
  base_unit         text not null check (base_unit in ('g', 'ml', 'cai')),
  purchase_unit     text,
  purchase_factor   numeric(14, 4) not null default 1 check (purchase_factor > 0),
  -- Chỉ có nghĩa với 'purchased'; bán thành phẩm bỏ qua (hụt đã nằm ở sản lượng mẻ).
  yield_pct         int not null default 100 check (yield_pct between 1 and 100),
  must_count        boolean not null default false,
  batch_output_qty  numeric(14, 3) check (batch_output_qty is null or batch_output_qty > 0),
  last_unit_cost    numeric(16, 6) check (last_unit_cost is null or last_unit_cost >= 0),
  last_cost_at      timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Tên không trùng trong một quán (chỉ xét nguyên liệu đang dùng — ẩn rồi tạo lại cùng tên được).
create unique index if not exists uq_ingredients_tenant_name
  on public.ingredients (tenant_id, lower(btrim(name)))
  where active;

create index if not exists idx_ingredients_tenant on public.ingredients (tenant_id);

-- Một bảng cho ba loại chủ (món / option / bán thành phẩm) thay vì ba bảng: một policy, một case
-- trong ma trận RLS, một hàm đọc.
create table if not exists public.recipe_lines (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  ingredient_id         uuid not null references public.ingredients (id) on delete restrict,
  qty                   numeric(14, 3) not null check (qty > 0),
  menu_item_id          uuid references public.menu_items (id) on delete cascade,
  modifier_option_id    uuid references public.modifier_options (id) on delete cascade,
  parent_ingredient_id  uuid references public.ingredients (id) on delete cascade,
  created_at            timestamptz not null default now(),
  constraint recipe_lines_one_owner
    check (num_nonnulls(menu_item_id, modifier_option_id, parent_ingredient_id) = 1),
  constraint recipe_lines_not_self check (parent_ingredient_id is distinct from ingredient_id)
);

create unique index if not exists uq_recipe_lines_item
  on public.recipe_lines (menu_item_id, ingredient_id) where menu_item_id is not null;
create unique index if not exists uq_recipe_lines_option
  on public.recipe_lines (modifier_option_id, ingredient_id) where modifier_option_id is not null;
create unique index if not exists uq_recipe_lines_parent
  on public.recipe_lines (parent_ingredient_id, ingredient_id) where parent_ingredient_id is not null;
create index if not exists idx_recipe_lines_tenant on public.recipe_lines (tenant_id);
create index if not exists idx_recipe_lines_ingredient on public.recipe_lines (ingredient_id);

-- ---- RLS (cách ly tenant; phân quyền vai trò ở tầng app — QD-005 D7) --------------------
alter table public.ingredients enable row level security;
drop policy if exists ingredients_tenant_all on public.ingredients;
create policy ingredients_tenant_all on public.ingredients
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));

alter table public.recipe_lines enable row level security;
drop policy if exists recipe_lines_tenant_all on public.recipe_lines;
create policy recipe_lines_tenant_all on public.recipe_lines
  for all
  using (tenant_id in (select public.auth_tenant_ids()))
  with check (tenant_id in (select public.auth_tenant_ids()));
