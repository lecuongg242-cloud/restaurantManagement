-- 0015_online_orders.sql — Đặt món mang về/giao (P5 / plan 05-02, ONLINE-01).
-- Không thêm bảng: orders đã có channel (takeaway/delivery) + customer_contact + table_session_id
-- nullable (0008). Ở đây: (1) mở source cho 'online'; (2) index hàng đợi theo kênh/trạng thái;
-- (3) cột liên kết bill ↔ đơn online cho plan 05-03 (thu tiền). RLS orders/bills đã có (0008/0012).

-- (1) source thêm 'online' (khách đặt online, phân biệt 'qr' tại bàn / 'staff' POS).
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders
  add constraint orders_source_check check (source in ('qr', 'staff', 'online'));

-- (2) Hàng đợi đơn online lọc theo (tenant, channel, status).
create index if not exists idx_orders_tenant_channel_status
  on public.orders (tenant_id, channel, status);

-- (3) Liên kết bill ↔ đơn online (1 đơn = 1 bill, table_session_id null) — dùng ở 05-03.
alter table public.bills
  add column if not exists online_order_id uuid references public.orders (id) on delete set null;

create index if not exists idx_bills_tenant_online_order
  on public.bills (tenant_id, online_order_id);
