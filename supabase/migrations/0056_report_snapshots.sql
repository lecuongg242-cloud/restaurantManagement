-- 0056_report_snapshots.sql — Báo cáo lịch sử không bị "viết lại" + SĐT khách một dạng
-- (REPORT-15, CUST-01; plan 30-KeHoach/P16/16-01).
--
-- LỖI 1 — XÓA BÀN LÀ MẤT LỊCH SỬ BÀN. Xóa bàn là xóa cứng; table_sessions.table_id ON DELETE CASCADE
-- (0008) xóa luôn phiên, rồi bills.table_session_id ON DELETE SET NULL (0012) cắt dây. Báo cáo "Khu vực &
-- bàn" đi bills → table_sessions → tables → areas nên doanh thu cũ của bàn đó rơi vào "Không gắn bàn".
-- Xóa khu vực thì tables.area_id SET NULL (0007) → rơi vào "Chưa xếp khu".
--
-- LỖI 2 — ĐỔI NHÓM MÓN LÀ ĐỔI SỐ LIỆU THÁNG TRƯỚC. report_by_category gom theo nhóm HIỆN TẠI của món
-- (order_items → menu_items → menu_categories). Chuyển món sang nhóm khác là doanh thu cũ chuyển theo;
-- xóa nhóm thì menu_items bị CASCADE (0004) → món cũ thành "Khác".
--
-- LỖI 3 — SĐT KHÁCH NHIỀU DẠNG. Chỉ màn QR (client) chuẩn hóa; online, POS mang về, đặt bàn lưu nguyên
-- chuỗi ("+84 912…", "0912.345…"). Code đã sửa ở phoneForStorage (lib/orders/guest-contact.ts); file này
-- chuẩn hóa dữ liệu CŨ bằng cùng quy tắc.
--
-- CÁCH SỬA 1+2: ghi TÊN tại thời điểm bán (snapshot) bằng trigger — phủ mọi đường tạo bill/món (6 chỗ gọi
-- nextBillNo, nhiều đường tạo order) mà không phải sửa từng chỗ. Quy tắc đọc:
--   • Bàn/khu: bàn CÒN thì theo tên hiện tại (đổi tên bàn không tách lịch sử làm hai); bàn đã xóa thì theo
--     snapshot. ⇒ ngay sau khi áp, số liệu KHÔNG đổi; chỉ khác khi bàn/khu bị xóa về sau.
--   • Nhóm món: snapshot TRƯỚC, nhóm hiện tại sau. ⇒ sau backfill (chép từ nhóm hiện tại) số liệu KHÔNG
--     đổi; từ nay chuyển món sang nhóm khác không kéo doanh thu cũ theo. Đổi TÊN nhóm thì lịch sử giữ tên cũ.
--
-- THÂN HÀM BÁO CÁO: lấy nguyên bản đang chạy trên production (0040 — đọc bills_revenue.business_at), chỉ đổi
-- phần chọn tên. KHÔNG lấy bản 0023 (đọc paid_at) — xem QD-013.
-- bills_revenue liệt kê cột tường minh (0040) nên không có cột snapshot mới ⇒ join lại bills theo khóa chính,
-- không đụng view.
--
-- ÁP: chạy NGOÀI giờ bán. Backfill cập nhật vài nghìn dòng bills/order_items/orders → mỗi dòng là một sự kiện
-- realtime tới POS đang mở. Không có trigger updated_at trên các bảng này (schema-snapshot) nên backfill
-- không đổi updated_at.

-- ---- 1. Cột snapshot --------------------------------------------------------
alter table public.bills       add column if not exists table_label    text;
alter table public.bills       add column if not exists area_label     text;
alter table public.order_items add column if not exists category_name  text;

comment on column public.bills.table_label is 'Tên bàn lúc tạo bill (0056). Báo cáo dùng khi bàn đã bị xóa.';
comment on column public.bills.area_label is 'Tên khu lúc tạo bill (0056). Báo cáo dùng khi bàn đã bị xóa.';
comment on column public.order_items.category_name is 'Tên nhóm món lúc gọi (0056). Báo cáo nhóm món ưu tiên cột này.';

-- ---- 2. Trigger điền snapshot -----------------------------------------------
-- security invoker: chỉ đọc tên của đúng bàn/món mà dòng đang ghi tham chiếu; người ghi vốn đọc được các bảng
-- này (service role, hoặc RLS cùng tenant).
create or replace function public.fill_bill_place_labels()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_table text;
  v_area  text;
begin
  -- Chỉ điền khi có phiên bàn. Phiên bị xóa (bàn bị xóa) làm table_session_id → NULL: GIỮ nhãn cũ.
  if new.table_session_id is not null then
    select t.name, a.name
      into v_table, v_area
      from public.table_sessions ts
      join public.tables t     on t.id = ts.table_id
      left join public.areas a on a.id = t.area_id
     where ts.id = new.table_session_id;
    if found then
      new.table_label := v_table;
      new.area_label  := v_area;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bills_place_labels on public.bills;
create trigger trg_bills_place_labels
  before insert or update of table_session_id on public.bills
  for each row execute function public.fill_bill_place_labels();

create or replace function public.fill_order_item_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category_name is null and new.menu_item_id is not null then
    select mc.name
      into new.category_name
      from public.menu_items mi
      join public.menu_categories mc on mc.id = mi.category_id
     where mi.id = new.menu_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_items_category on public.order_items;
create trigger trg_order_items_category
  before insert on public.order_items
  for each row execute function public.fill_order_item_category();

-- ---- 3. Backfill snapshot từ dữ liệu hiện có ---------------------------------
-- Bàn/nhóm ĐÃ bị xóa trước ngày áp thì không khôi phục được — dữ liệu gốc không còn.
update public.bills b
   set table_label = t.name,
       area_label  = a.name
  from public.table_sessions ts
  join public.tables t     on t.id = ts.table_id
  left join public.areas a on a.id = t.area_id
 where ts.id = b.table_session_id
   and b.table_label is null;

update public.order_items oi
   set category_name = mc.name
  from public.menu_items mi
  join public.menu_categories mc on mc.id = mi.category_id
 where mi.id = oi.menu_item_id
   and oi.category_name is null;

-- ---- 4. Báo cáo đọc snapshot (thân = bản production ở 0040, chỉ đổi phần chọn tên) ----
CREATE OR REPLACE FUNCTION public.report_by_area(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(area_name text, table_name text, revenue bigint, bill_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    case
      when t.id is not null          then coalesce(a.name, 'Chưa xếp khu')
      when bb.table_label is not null then coalesce(bb.area_label, 'Chưa xếp khu')
      else 'Không gắn bàn'
    end,
    coalesce(t.name, bb.table_label, '—'),
    coalesce(sum(b.total), 0)::bigint,
    count(*)::bigint
  from public.bills_revenue b
  join public.bills bb               on bb.id = b.id
  left join public.table_sessions ts on ts.id = b.table_session_id
  left join public.tables t          on t.id  = ts.table_id
  left join public.areas a           on a.id  = t.area_id
  where b.tenant_id = p_tenant and b.status = 'paid' and b.split_count is null
    and b.business_at >= p_from and b.business_at < p_to
  group by 1, 2 order by 3 desc;
$function$;

CREATE OR REPLACE FUNCTION public.report_by_category(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(name text, qty bigint, revenue bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(oi.category_name, mc.name, 'Khác'), sum(bi.qty_allocated)::bigint, sum(bi.amount)::bigint
  from public.bill_items bi
  join public.bills_revenue b         on b.id  = bi.bill_id
  join public.order_items oi          on oi.id = bi.order_item_id
  left join public.menu_items mi      on mi.id = oi.menu_item_id
  left join public.menu_categories mc on mc.id = mi.category_id
  where bi.tenant_id = p_tenant and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 3 desc;
$function$;

-- ---- 5. Chuẩn hóa SĐT cũ (cùng quy tắc với phoneForStorage) -------------------
-- Bỏ mọi ký tự không phải số; 84… (≥ 10 số) → 0…; chỉ ghi khi kết quả là SĐT Việt Nam hợp lệ ^0\d{9,10}$.
-- Chuỗi không phải SĐT (khách gõ "gọi Zalo"…) giữ nguyên, như code mới.
create or replace function public.normalize_vn_phone(p_raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when d ~ '^84' and length(d) >= 10 then '0' || substr(d, 3)
           else d
         end
    from (select regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g') as d) s
$$;

update public.orders o
   set customer_contact = jsonb_set(o.customer_contact, '{phone}', to_jsonb(public.normalize_vn_phone(o.customer_contact->>'phone')))
 where o.customer_contact ? 'phone'
   and jsonb_typeof(o.customer_contact->'phone') = 'string'
   and public.normalize_vn_phone(o.customer_contact->>'phone') ~ '^0[0-9]{9,10}$'
   and public.normalize_vn_phone(o.customer_contact->>'phone') <> o.customer_contact->>'phone';

update public.reservations r
   set customer_phone = public.normalize_vn_phone(r.customer_phone)
 where public.normalize_vn_phone(r.customer_phone) ~ '^0[0-9]{9,10}$'
   and public.normalize_vn_phone(r.customer_phone) <> r.customer_phone;
