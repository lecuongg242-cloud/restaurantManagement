-- 0060_platform_settings.sql — Cấu hình thu tiền thuê bao của NỀN TẢNG, sửa được ở /super → Cài đặt nền tảng
-- (chủ dự án 27/09/2026, sau 13-04; QD-021 U3).
--
-- Trước đây đọc từ biến môi trường PLATFORM_* — đổi số tài khoản hay giá là phải sửa Vercel rồi deploy lại.
-- Giờ lưu ở đây; biến môi trường vẫn là giá trị DỰ PHÒNG cho trường nào để trống (lib/platform/config.ts).
--
-- Đúng MỘT dòng (khóa chính `id boolean = true`). Không mang tenant_id: đây là dữ liệu của nền tảng, không
-- của quán nào. Chỉ super-admin đọc/ghi qua phiên; trang Gia hạn của chủ quán đọc bằng service role ở server
-- và chỉ hiển thị phần cần để chuyển khoản.

create table if not exists public.platform_settings (
  id                boolean primary key default true check (id),
  bank_bin          text null check (bank_bin is null or bank_bin ~ '^\d{6}$'),
  bank_account_no   text null check (bank_account_no is null or bank_account_no ~ '^\d{6,19}$'),
  bank_account_name text null check (bank_account_name is null or bank_account_name ~ '^[A-Z0-9 ]{1,50}$'),
  price_month       integer null check (price_month is null or price_month > 0),
  price_year        integer null check (price_year is null or price_year > 0),
  price_lifetime    integer null check (price_lifetime is null or price_lifetime > 0),
  support_phone     text null check (support_phone is null or char_length(support_phone) <= 30),
  updated_at        timestamptz not null default now(),
  updated_by        uuid null
);

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_super on public.platform_settings;
create policy platform_settings_super on public.platform_settings
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.platform_settings from anon;
