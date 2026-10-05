-- 0086_order_eat_in.sql — Đơn không bàn: khách ăn TẠI QUÁN hay MANG VỀ (P35, ORDER-27..30).
--
-- Quán chế độ "Theo bàn" (VD: sáng bán đồ ăn sáng không bàn, tối bán lẩu theo bàn) gõ đơn không bàn qua luồng
-- channel='takeaway' — trước đây mọi đơn đó đều in "Mang về" dù khách ngồi ăn tại quán. Nhân viên nay chọn
-- "Tại quán" / "Mang về" khi tạo đơn (như CUKCUK "Ngồi tại bàn / Mang về", iPOS "Tại chỗ / Mang về").
--
-- Giữ channel='takeaway' để không đụng hàng chờ / thu tiền / gọi thêm. Đơn cũ = false ⇒ vẫn "Mang về" như giấy đã in.
-- Quán chế độ "Tại quầy" không đọc cột này (mọi đơn nhân viên gõ vẫn là "Tại quán").

alter table public.orders add column if not exists eat_in boolean not null default false;

-- Báo cáo "Theo nơi phục vụ" cần tách Tại quán / Mang về ⇒ trả thêm eat_in. Đổi kiểu trả về ⇒ phải drop.
-- Thân hàm giữ nguyên bản đang chạy (0040: bills_revenue + business_at).
drop function if exists public.report_by_channel(uuid, timestamptz, timestamptz);

create function public.report_by_channel(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (channel text, source text, has_table boolean, eat_in boolean, revenue bigint, item_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select o.channel, o.source, (o.table_session_id is not null), o.eat_in,
         sum(bi.amount)::bigint, sum(bi.qty_allocated)::bigint
  from public.bill_items bi
  join public.bills_revenue b on b.id  = bi.bill_id
  join public.order_items oi  on oi.id = bi.order_item_id
  join public.orders o        on o.id  = oi.order_id
  where bi.tenant_id = p_tenant and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by 1, 2, 3, 4 order by 5 desc;
$$;

revoke all on function public.report_by_channel(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.report_by_channel(uuid, timestamptz, timestamptz) to authenticated;
