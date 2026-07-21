-- 0003_station_pin.sql — PIN + tài khoản trạm (P1 / plan 01-03, QD-005 "Làm rõ D7").
-- role 'station' + user_id NULLABLE đã có từ 0001. Bổ sung index tra cứu theo vai trò.
--
-- Mô hình chốt (D7):
--   membership role='station'          → CÓ user_id (đăng nhập dùng chung thiết bị, cửa RLS)
--   membership cashier/waiter/kitchen  → user_id = NULL + pin_hash (PIN-only, không tài khoản Supabase)

create index if not exists idx_memberships_tenant_role
  on public.memberships (tenant_id, role);

-- Chỉ 1 membership PIN-only active/tên hiển thị/tenant (tránh trùng tên nhân viên trạm).
create index if not exists idx_memberships_pin_lookup
  on public.memberships (tenant_id, active)
  where user_id is null;
