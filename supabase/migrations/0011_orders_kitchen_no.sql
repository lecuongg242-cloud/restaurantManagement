-- 0011_orders_kitchen_no.sql — Số thứ tự bếp theo ngày (P3, sửa 22/07/2026).
-- Gán khi order xuống bếp (confirmed) — bếp/phiếu in hiển thị "Đơn #N" để biết xử lý trước.
-- Reset mỗi ngày theo giờ Việt Nam (logic gán ở app). Nullable (order chưa confirmed = null).

alter table public.orders add column if not exists kitchen_no int;
