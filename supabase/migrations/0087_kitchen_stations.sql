-- 0087_kitchen_stations.sql — In theo bếp/bar (P37, PRINT-19..23).
--
-- Quán có bếp + quầy pha chế muốn đồ uống in ra máy ở quầy bar (như KiotViet "Máy in bar bếp", CUKCUK "Danh mục Bếp/Bar",
-- Sapo "bar/bếp", iPOS "Quản lý máy in"). Mỗi bếp/bar nhận các NHÓM MÓN (danh mục thực đơn) gán cho nó; danh mục chưa gán
-- → Bếp chính. Chọn máy in cho từng bếp/bar nằm trên app tại quán (IP/USB gắn mạng quán), không ở đây.
--
-- Bếp chính (is_default) tạo lười khi chủ quán lưu lần đầu; chưa có dòng ⇒ mặc định "Bếp chính", 1 liên, không in từng món.
-- print_jobs.target_station: Bếp chính giữ 'kitchen' (cầu in cũ vẫn đúng); bếp/bar khác = id dạng chữ.

create table if not exists public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  is_default boolean not null default false,
  copies smallint not null default 1 check (copies between 1 and 3),
  per_item boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Khóa đôi cho khóa ngoại của menu_categories: danh mục chỉ trỏ được bếp/bar CÙNG quán.
  unique (tenant_id, id)
);

create unique index if not exists kitchen_stations_one_default
  on public.kitchen_stations (tenant_id) where is_default;
create index if not exists idx_kitchen_stations_tenant on public.kitchen_stations (tenant_id, sort_order);

alter table public.kitchen_stations enable row level security;

-- Đọc: mọi thành viên quán (thu ngân tạo phiếu, tài khoản printer của cầu in, app đọc danh sách để chọn máy in).
drop policy if exists kitchen_stations_read on public.kitchen_stations;
create policy kitchen_stations_read on public.kitchen_stations
  for select using (tenant_id in (select public.auth_tenant_ids()));

-- Ghi: chủ quán / quản lý.
drop policy if exists kitchen_stations_write on public.kitchen_stations;
create policy kitchen_stations_write on public.kitchen_stations
  for all
  using (tenant_id = any (public.manager_tenants(array[tenant_id])))
  with check (tenant_id = any (public.manager_tenants(array[tenant_id])));

alter table public.menu_categories add column if not exists station_id uuid null;
alter table public.menu_categories drop constraint if exists menu_categories_station_fk;
alter table public.menu_categories
  add constraint menu_categories_station_fk
  foreign key (tenant_id, station_id) references public.kitchen_stations (tenant_id, id)
  on delete set null (station_id);

-- Phiếu hủy món ra bếp (PRINT-23).
alter table public.print_jobs drop constraint if exists print_jobs_type_check;
alter table public.print_jobs
  add constraint print_jobs_type_check
  check (type in ('receipt', 'kitchen_ticket', 'customer_ticket', 'cancel_ticket'));
