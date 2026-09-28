-- P16 phần còn mở (28/09/2026):
--   1. 16-02 "Bấm vào một nhân viên" → danh sách đơn đã nhận / hóa đơn đã thu / món đã hủy trong kỳ, phân trang ở SQL.
--   2. 16-01 lỗi còn tồn: xóa bàn đang có phiên MỞ cắt đơn đang ăn khỏi bàn (table_sessions CASCADE) → chặn ở DB.
-- Chỉ thêm hàm + trigger; không đổi bảng, không đổi hàm cũ.

-- ---- 1. Chi tiết theo nhân viên ------------------------------------------------------------------------------------
-- Cùng vị từ với report_by_staff (0068) để Σ chi tiết = số trên dòng tổng:
--   p_kind 'staff' + p_membership | 'customer' (khách tự gọi QR / online — chỉ có ở góc 'nhan') | 'unknown' (không rõ người).
--   p_view 'nhan' = đơn đã nhận (giá trị theo bill_items của bill đã trả, theo business_at)
--          'thu'  = hóa đơn đã thu (payments, theo business_at của bill)
--          'huy'  = món đã hủy (theo cancelled_at)
-- Chỉ chủ / quản lý (manager_tenants) — thu ngân gọi thẳng nhận 0 dòng.
create or replace function public.report_staff_detail(
  p_tenants uuid[], p_from timestamptz, p_to timestamptz,
  p_kind text, p_membership uuid, p_view text,
  p_offset integer default 0, p_limit integer default 50
)
returns table (
  total_count bigint,
  at timestamptz,
  tenant_id uuid,
  bill_no integer,
  kitchen_no integer,
  place text,
  detail text,
  qty bigint,
  amount bigint,
  method text
)
language sql
stable
set search_path = public
as $$
  with t as (select unnest(public.manager_tenants(p_tenants)) as id),
  nhan as (
    select o.id as k, o.created_at as at, o.tenant_id, null::integer as bill_no, o.kitchen_no,
           coalesce(min(b.table_label), case when o.table_session_id is null then 'Mang về / tại quầy' end) as place,
           case o.source when 'qr' then 'Khách quét QR' when 'online' then 'Đặt online' else 'POS' end as detail,
           sum(bi.qty_allocated)::bigint as qty, sum(bi.amount)::bigint as amount, null::text as method
    from public.bill_items bi
    join public.bills_revenue br on br.id = bi.bill_id
    join public.bills b on b.id = br.id
    join public.order_items oi on oi.id = bi.order_item_id
    join public.orders o on o.id = oi.order_id
    where p_view = 'nhan' and bi.tenant_id in (select id from t) and br.status = 'paid'
      and br.business_at >= p_from and br.business_at < p_to
      and case p_kind
            when 'staff' then coalesce(o.created_by, o.confirmed_by) = p_membership
            when 'customer' then coalesce(o.created_by, o.confirmed_by) is null and o.source in ('qr', 'online')
            else coalesce(o.created_by, o.confirmed_by) is null and o.source not in ('qr', 'online')
          end
    group by o.id
  ),
  thu as (
    select p.id as k, br.business_at as at, p.tenant_id, br.bill_no, null::integer as kitchen_no,
           coalesce(b.table_label, 'Không gắn bàn') as place, p.note as detail,
           null::bigint as qty, p.amount::bigint as amount, p.method
    from public.payments p
    join public.bills_revenue br on br.id = p.bill_id
    join public.bills b on b.id = br.id
    where p_view = 'thu' and p.tenant_id in (select id from t)
      and br.business_at >= p_from and br.business_at < p_to
      and case p_kind when 'staff' then p.received_by = p_membership when 'unknown' then p.received_by is null else false end
  ),
  huy as (
    select oi.id as k, oi.cancelled_at as at, oi.tenant_id, null::integer as bill_no, o.kitchen_no,
           oi.name_snapshot as place, oi.cancel_reason as detail,
           oi.qty::bigint as qty, (oi.unit_price_snapshot::bigint * oi.qty) as amount, null::text as method
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where p_view = 'huy' and oi.tenant_id in (select id from t) and oi.status = 'cancelled'
      and oi.cancelled_at >= p_from and oi.cancelled_at < p_to
      and case p_kind when 'staff' then oi.cancelled_by = p_membership when 'unknown' then oi.cancelled_by is null else false end
  ),
  tat_ca as (select * from nhan union all select * from thu union all select * from huy)
  select count(*) over (), x.at, x.tenant_id, x.bill_no, x.kitchen_no, x.place, x.detail, x.qty, x.amount, x.method
  from tat_ca x
  order by x.at desc, x.k  -- khóa phụ: nhiều dòng trùng giờ ⇒ thứ tự giữa các trang phải cố định
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

revoke execute on function public.report_staff_detail(uuid[], timestamptz, timestamptz, text, uuid, text, integer, integer) from public, anon;
grant execute on function public.report_staff_detail(uuid[], timestamptz, timestamptz, text, uuid, text, integer, integer) to authenticated;

-- ---- 2. Không xóa bàn đang có khách --------------------------------------------------------------------------------
-- table_sessions.table_id on delete cascade (0008) ⇒ xóa bàn đang mở phiên xóa luôn phiên, đơn đang ăn mất bàn.
-- Chặn ở DB (không chỉ ở màn hình): mọi đường xóa đều qua đây. Bàn đã đóng hết phiên xóa bình thường — lịch sử
-- báo cáo giữ tên bàn nhờ ảnh chụp 0056.
create or replace function public.tables_block_delete_open()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Xóa cả quán (cascade từ tenants): dòng tenant đã đi trước ⇒ không chặn.
  if exists (select 1 from public.table_sessions s where s.table_id = old.id and s.status = 'open')
     and exists (select 1 from public.tenants tn where tn.id = old.tenant_id) then
    raise exception 'Bàn "%" đang có khách — thanh toán hoặc chuyển bàn trước khi xóa.', old.name
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists tables_block_delete_open on public.tables;
create trigger tables_block_delete_open
  before delete on public.tables
  for each row execute function public.tables_block_delete_open();
