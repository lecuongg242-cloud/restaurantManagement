-- 0036_pay_bill_revoke_public.sql — Thu quyền EXECUTE của `pay_bill` về đúng lời hứa trong 0035.
--
-- `0035_pay_bill_rpc.sql:149` ghi "Chỉ mở cho user đã đăng nhập" rồi chỉ `grant`, không `revoke` —
-- nên PUBLIC và `anon` vẫn giữ EXECUTE. Đây đúng lỗi mà `0032` đã viết ra để sửa cho
-- `unsplit_bill_evenly`; để nguyên là hai hàm tiền cùng loại lại có hai mức quyền khác nhau.
--
-- KHÔNG phải lỗ hổng khai thác được: `auth_tenant_ids()` là `security definer` đọc `memberships`
-- theo `auth.uid()`, nên với `anon` nó trả rỗng, policy `bills_tenant_all`/`payments_tenant_all`
-- không khớp dòng nào, và RPC trả `{"ok":false,"code":"not_found"}` mà không khóa hàng, không ghi
-- gì. Nhưng comment nói một đằng ACL một nẻo là thứ người sau sẽ tin nhầm — sửa cho khớp.

revoke execute on function public.pay_bill(uuid, uuid, text, timestamptz, text, uuid, uuid) from public;
revoke execute on function public.pay_bill(uuid, uuid, text, timestamptz, text, uuid, uuid) from anon;
grant  execute on function public.pay_bill(uuid, uuid, text, timestamptz, text, uuid, uuid) to authenticated;
