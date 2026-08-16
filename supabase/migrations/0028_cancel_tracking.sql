-- 0027_cancel_tracking.sql — Mốc thời gian HỦY (ORDER-17/18, REPORT-10).
--
-- LÝ DO: `order_items`/`orders` mới chỉ có `cancel_reason` + `cancelled_by`, KHÔNG có mốc
-- thời gian hủy. Không có mốc này thì không xếp được một lượt hủy vào kỳ báo cáo, và vĩnh
-- viễn không phân tích được "hủy vào giờ nào" hay "hủy sau bao lâu kể từ lúc gọi".

alter table public.order_items add column if not exists cancelled_at timestamptz;
alter table public.orders      add column if not exists cancelled_at timestamptz;

-- Backfill `orders`: CHÍNH XÁC. 'cancelled' là trạng thái kết thúc (ORDER_FLOW.cancelled = [])
-- nên không còn transition nào sau đó — `updated_at` chính là lúc hủy.
update public.orders
   set cancelled_at = updated_at
 where status = 'cancelled' and cancelled_at is null;

-- Backfill `order_items`: XẤP XỈ. Bảng này không có `updated_at`, không có mốc nào tốt hơn.
-- `created_at` là lúc GỌI món, KHÔNG phải lúc hủy. Số liệu hủy trước 16/08/2026 chỉ dùng để
-- tham khảo, đừng đọc như mốc thật.
update public.order_items
   set cancelled_at = created_at
 where status = 'cancelled' and cancelled_at is null;

-- Index riêng cho báo cáo hủy: partial nên chỉ chứa dòng 'cancelled' (phần rất nhỏ của bảng).
create index if not exists idx_order_items_cancelled
  on public.order_items (tenant_id, cancelled_at)
  where status = 'cancelled';
