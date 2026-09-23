-- 0039_suspend_gate.sql — Thực thi tenants.status = 'suspended' (P7 / plan 07-03, QD-012 §2).
--
-- LỖI TRƯỚC ĐÓ: /super cho bật/tắt `status` và ghi đúng giá trị (0001 có sẵn cột, ràng buộc
-- check active|suspended), nhưng KHÔNG chỗ nào đọc nó. Quán bị "tạm ngưng" vẫn gọi món, in bếp,
-- đóng bill, xem báo cáo bình thường. Không khóa được quán nghĩa là không có đòn bẩy nào khi
-- khách không trả tiền, và không cô lập được một quán đang gây sự cố.
--
-- CÁCH SỬA: chặn ngay tại auth_tenant_ids(). Mọi policy tenant (0002, 0004, 0006, 0007, 0008,
-- 0010, 0012, 0014, 0018…) đều đi qua hàm này, nên một hàm đổi là 18 bảng khóa theo. Rải điều
-- kiện ở tầng app thì quên một chỗ là thủng; ở đây thì không có chỗ nào để mà quên.
--
-- KHÔNG ảnh hưởng super-admin: is_super_admin() là nhánh riêng trong mọi policy, nên super-admin
-- vẫn vào /super và bật lại quán được. Ngưng KHÔNG xóa dữ liệu.
--
-- BỀ MẶT KHÁCH chạy service-role nên RLS không chạm tới — phần đó chặn ở
-- lib/tenant/active.ts + app/r/[slug]/layout.tsx.
--
-- Giữ nguyên security definer + search_path của 0002 (tránh đệ quy policy trên memberships).
-- Kiểm tương đương trước khi áp (23/09/2026): tập (user_id, tenant_id) của hàm cũ và hàm mới
-- khớp 100% — 10/10 dòng, không mất không thêm, vì lúc đó không quán nào khác 'active'.

create or replace function public.auth_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid()
    and m.active
    and t.status = 'active'
$$;
