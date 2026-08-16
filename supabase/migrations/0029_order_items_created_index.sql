-- 0029_order_items_created_index.sql — Index cho MẪU SỐ của tỷ lệ hủy (REPORT-10).
--
-- LÝ DO: `report_cancel_summary` (0028) tính `ordered_qty` bằng subquery lọc `order_items` theo
-- (tenant_id, created_at). Index có sẵn chỉ phủ vế TỬ SỐ — `idx_order_items_cancelled` là partial
-- `where status = 'cancelled'` (0027) — còn index còn lại là (tenant_id, order_id). Không có
-- index này thì mẫu số là một lượt quét toàn bộ dòng của tenant trên BẢNG LỚN NHẤT hệ thống, và
-- nó chạy HAI lần mỗi lần mở trang báo cáo (kỳ này + kỳ trước). REPORT-04 đặt mức "đúng ở mọi
-- quy mô", nên đây là điều kiện để giữ được mức đó.
--
-- Không sửa 0027/0028 (đã áp lên dev) — thêm index ở migration mới.

create index if not exists idx_order_items_tenant_created
  on public.order_items (tenant_id, created_at);
