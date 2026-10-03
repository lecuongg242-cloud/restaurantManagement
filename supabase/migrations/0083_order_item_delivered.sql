-- 0083_order_item_delivered.sql — Phục vụ "Mang ra" (P27, QD-032). Bếp báo xong bằng status 'ready' (đã có); món ĐÃ MANG RA
-- ghi ở cột riêng, KHÔNG dùng 'served' — cả hệ thống coi 'served' = đã thu tiền (pay_bill đánh, đóng phiên / chặn hủy / gộp
-- bàn dựa vào đó). Món rời màn bếp khi delivered_at có giá trị.
--
-- Hai cột rỗng được, không đổi dữ liệu cũ; code cũ không đọc tới nên áp trước khi deploy vẫn an toàn. RLS sẵn có của
-- order_items (thành viên quán) áp nguyên.

alter table public.order_items
  add column if not exists delivered_at timestamptz null,
  add column if not exists delivered_by uuid null;
