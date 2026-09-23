-- 0038_printer_role.sql — Vai trò `printer` cho cầu in cục bộ (P7 / plan 07-02, QD-012 §1).
--
-- LÝ DO: trước đây cầu in đặt tại quán giữ SUPABASE_SERVICE_ROLE_KEY trong .env.local. Service
-- role bỏ qua RLS ⇒ một máy quán bị mất là lộ dữ liệu của MỌI nhà hàng. Mỗi quán mở thêm là thêm
-- một bản sao khóa chủ đặt ở nơi ta không kiểm soát — rủi ro cộng dồn tuyến tính, hậu quả thì
-- toàn hệ thống chứ không phải một quán.
--
-- CÁCH SỬA: cầu in đăng nhập như mọi client khác, bằng tài khoản thiết bị riêng của quán.
-- KHÔNG cần policy mới: `print_jobs_tenant_all` (0010) đã dựa trên auth_tenant_ids(), nên tài
-- khoản có membership ở tenant nào thì thấy đúng print_jobs của tenant đó.
--
-- `printer` cố ý KHÔNG mở được bề mặt nào — chặn ở canAccess() tầng app (lib/auth/rbac.ts), và
-- canAssignRole() không cho owner/manager tự cấp loại tài khoản này (cấp ở /super).
--
-- Chỉ nới ràng buộc, không đụng dữ liệu cũ → an toàn chạy lại nhiều lần.

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'manager', 'cashier', 'waiter', 'kitchen', 'station', 'printer'));
