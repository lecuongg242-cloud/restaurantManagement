-- 0084 — Vá rò rỉ: view `bills_revenue` (0040) chạy bằng quyền CHỦ view (postgres, bỏ qua RLS) và được cấp SELECT cho
-- `anon` ⇒ ai có khóa công khai (nằm sẵn trong trang web) đọc được hóa đơn của MỌI quán qua /rest/v1/bills_revenue
-- (phát hiện 04/10/2026 khi làm P30: anon đếm được 6.411 dòng; bảng `bills` thì RLS chặn đúng = 0 dòng).
--
-- Sửa: view chạy bằng quyền NGƯỜI GỌI ⇒ RLS của `bills` / `bill_items` / `order_items` / `orders` áp lên mọi lần đọc.
-- Các RPC báo cáo (report_*, SECURITY INVOKER) gọi bởi chủ/quản lý vẫn đọc được đúng quán của mình; service role
-- (cron dự báo, xuất Excel phía máy chủ) bỏ qua RLS như trước. Thu hồi luôn quyền của `anon` và các quyền ghi thừa.
alter view public.bills_revenue set (security_invoker = true);

revoke all on public.bills_revenue from anon;
revoke insert, update, delete, truncate, references, trigger on public.bills_revenue from authenticated;
grant select on public.bills_revenue to authenticated;
