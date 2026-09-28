-- 0061_platform_plans.sql — Gói dịch vụ do super-admin TỰ ĐẶT (chủ dự án 27/09/2026).
--
-- Trước: 3 giá cố định trong platform_settings (tháng / năm / vĩnh viễn), gói khác suy ra bằng công thức
-- (2 năm = 2 × giá năm) — không đặt được giá ưu đãi riêng. Giờ mỗi gói là một dòng: tên, thời hạn (số tháng,
-- rỗng = vĩnh viễn), giá. Thêm/bớt tùy ý ở /super → Cài đặt nền tảng. Trang Gia hạn của quán hiện đúng các
-- gói đang bật `visible`.
--
-- Chuyển 3 giá đã lưu thành 3 gói rồi bỏ 3 cột giá cũ. Nhật ký gia hạn (subscription_payments) lưu số tháng
-- + số tiền, không trỏ tới gói ⇒ xóa/sửa gói không làm đổi lịch sử.

create table if not exists public.platform_plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  months     integer null check (months is null or months between 1 and 120),
  price      integer not null check (price > 0),
  visible    boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.platform_plans enable row level security;

drop policy if exists platform_plans_super on public.platform_plans;
create policy platform_plans_super on public.platform_plans
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.platform_plans from anon;

insert into public.platform_plans (name, months, price)
select v.name, v.months, v.price
from public.platform_settings s
cross join lateral (values
  ('1 tháng', 1, s.price_month),
  ('1 năm', 12, s.price_year),
  ('Vĩnh viễn', null::integer, s.price_lifetime)
) as v(name, months, price)
where v.price is not null
  and not exists (select 1 from public.platform_plans);

alter table public.platform_settings drop column if exists price_month;
alter table public.platform_settings drop column if exists price_year;
alter table public.platform_settings drop column if exists price_lifetime;
