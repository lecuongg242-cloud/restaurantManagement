-- 0042_capture_missing_index.sql — Chụp nốt một index chỉ có trên production (QD-013).
--
-- `0040` chụp view, hàm và trigger nhưng BỎ SÓT index. Lệch này chỉ lộ ra khi dựng database mới
-- từ repo ngày 24/09/2026 và chạy `npm run schema:check`: index có trong snapshot (chụp từ
-- production) nhưng không migration nào tạo ra nó.
--
-- Đây đúng là ca mà cổng chặn OPS-07 sinh ra để bắt, và nó bắt ngay lần dùng thật đầu tiên.
--
-- Index này phục vụ `paidQtyMap` trong `lib/billing/bill.ts`: tra `bill_items` theo `order_item_id`
-- rồi lọc theo bill đã 'paid' — chạy mỗi lần thu tiền.
--
-- Không đổi hành vi production (index đã tồn tại ở đó); mục đích là để môi trường mới dựng từ repo
-- có cùng index, không chậm hơn một cách khó hiểu.

create index if not exists idx_bill_items_order_item_bill
  on public.bill_items (order_item_id, bill_id);
