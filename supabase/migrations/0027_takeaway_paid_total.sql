-- 0027_takeaway_paid_total.sql — Tiền đã thu ở màn POS phải cùng gốc với trang Báo cáo.
--
-- HAI LỖI ĐANG SỬA (đo trên dữ liệu thật, tenant QT Food, ngày 14/08/2026):
--
-- 1) SAI GỐC NGÀY. POS cộng tiền theo NGÀY TẠO ĐƠN (`orders.created_at`), Báo cáo cộng theo
--    NGÀY THU TIỀN (`bills.paid_at`). Hôm 13/08 quán bỏ sót 37 đơn chưa chốt, sáng 14/08 mới
--    bấm thanh toán ⇒ POS báo 13.585.000đ còn Báo cáo báo 18.350.000đ, lệch đúng 4.765.000đ.
--    Tiền trong két là con số theo `paid_at` ⇒ POS phải đổi theo gốc này.
--
-- 2) CỘNG THIẾU ÂM THẦM. Bản cũ kéo từng dòng `bills.total` qua PostgREST rồi cộng trong JS với
--    `.limit(5000)`, nhưng PostgREST chặn cứng ở 1000 dòng (đã đo: xin 5000 → trả 1000). QT Food
--    có 1154 hóa đơn/30 ngày ⇒ chọn "30 ngày" là cộng thiếu, mà cờ `paidTotalCapped` lại không
--    bật (1000 < 5000) nên màn hình không hề cảnh báo. Dồn SUM xuống Postgres thì hết trần.
--
-- QUY ƯỚC: giống BILL-05 — chỉ `status='paid'` và `split_count is null` (loại "vỏ" chia đều).
-- Không lọc theo `orders.status`: khách trả trước khi đơn còn đang làm vẫn là tiền đã thu.
--
-- BẢO MẬT: `security invoker` ⇒ RLS tenant (0002/0012) giữ nguyên; thêm `tenant_id = p_tenant`
-- tường minh để phòng thủ nhiều lớp.

create or replace function public.takeaway_paid_total(
  p_tenant   uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_root_ids uuid[] default null
)
returns table (paid_total bigint, paid_bills bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(b.total), 0)::bigint as paid_total,
    count(*)::bigint                  as paid_bills
  from public.bills b
  join public.orders o on o.id = b.online_order_id
  where b.tenant_id = p_tenant
    and b.status = 'paid'
    and b.split_count is null
    and o.channel = 'takeaway'
    and o.parent_order_id is null
    -- Đang tìm kiếm (p_root_ids ≠ null): tổng của đúng các đơn khớp, bất kể thu ngày nào —
    -- nếu chặn thêm theo kỳ thì đơn tìm thấy lại hiện tiền 0, vô lý với người đang tra cứu.
    and (
      case when p_root_ids is null
           then b.paid_at >= p_from and b.paid_at < p_to
           else o.id = any(p_root_ids)
      end
    );
$$;

grant execute on function public.takeaway_paid_total(uuid, timestamptz, timestamptz, uuid[]) to authenticated;

-- Cộng tiền quét theo kỳ trên bills đã có idx_bills_tenant_paid_at (0012); phần join dùng khóa chính.
