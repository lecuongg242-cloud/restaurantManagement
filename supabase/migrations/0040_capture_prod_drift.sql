-- 0040_capture_prod_drift.sql — Chụp lại schema production vào repo (P8, QD-013).
--
-- LỖI TRƯỚC ĐÓ: production có những đối tượng KHÔNG hề tồn tại trong repo. Chúng được tạo bằng
-- tay trên SQL editor, nên "supabase db push" báo up-to-date trong khi repo mô tả một schema khác
-- hẳn. Hậu quả cụ thể: dựng môi trường mới từ repo sẽ ra BÁO CÁO DOANH THU KHÁC mà không ai được
-- cảnh báo; và nếu ai chạy lại 0023/0027 thì production mất luôn logic ngày kinh doanh.
--
-- Migration này KHÔNG đổi hành vi production: mọi lệnh là create-or-replace với đúng thân đang
-- chạy. Mục đích duy nhất là từ nay repo mô tả đúng production.
--
-- Nội dung được CHỤP TỰ ĐỘNG ngày 23/09/2026 bằng pg_get_viewdef / pg_get_functiondef /
-- pg_get_triggerdef — không gõ tay, để không sai một dấu.

-- ---- bills_revenue: ngày kinh doanh -----------------------------------------
-- business_at = giờ của đơn ĐẦU TIÊN trong hóa đơn (lùi dần: đơn của phiên bàn, rồi created_at).
-- Nhờ vậy hóa đơn thu lúc 1h sáng vẫn tính vào ngày kinh doanh hôm trước — đúng cách quán tính
-- doanh thu, thay vì cắt theo nửa đêm lịch.

create or replace view public.bills_revenue as
SELECT id,
    tenant_id,
    bill_no,
    table_session_id,
    status,
    subtotal,
    discount_type,
    discount_value,
    discount_amount,
    service_charge_pct,
    service_charge_amount,
    vat_pct,
    vat_amount,
    total,
    note,
    created_by,
    closed_by,
    paid_at,
    created_at,
    updated_at,
    split_parent_id,
    split_count,
    online_order_id,
    COALESCE(( SELECT min(o.created_at) AS min
           FROM bill_items bi
             JOIN order_items oi ON oi.id = bi.order_item_id
             JOIN orders o ON o.id = oi.order_id
          WHERE bi.bill_id = b.id), ( SELECT min(o.created_at) AS min
           FROM orders o
          WHERE o.table_session_id = b.table_session_id AND b.table_session_id IS NOT NULL), created_at) AS business_at
   FROM bills b;

-- ---- 9 hàm báo cáo: đọc bills_revenue thay vì bills -------------------------
-- Bản trong 0023/0027 đọc bills.paid_at. Bản đang chạy đọc bills_revenue.business_at.

CREATE OR REPLACE FUNCTION public.report_by_area(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(area_name text, table_name text, revenue bigint, bill_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce(a.name, case when t.id is null then 'Không gắn bàn' else 'Chưa xếp khu' end),
    coalesce(t.name, '—'),
    coalesce(sum(b.total), 0)::bigint,
    count(*)::bigint
  from public.bills_revenue b
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
  select coalesce(mc.name, 'Khác'), sum(bi.qty_allocated)::bigint, sum(bi.amount)::bigint
  from public.bill_items bi
  join public.bills_revenue b         on b.id  = bi.bill_id
  join public.order_items oi          on oi.id = bi.order_item_id
  left join public.menu_items mi      on mi.id = oi.menu_item_id
  left join public.menu_categories mc on mc.id = mi.category_id
  where bi.tenant_id = p_tenant and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 3 desc;
$function$;

CREATE OR REPLACE FUNCTION public.report_by_channel(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(channel text, source text, has_table boolean, revenue bigint, item_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select o.channel, o.source, (o.table_session_id is not null),
         sum(bi.amount)::bigint, sum(bi.qty_allocated)::bigint
  from public.bill_items bi
  join public.bills_revenue b on b.id  = bi.bill_id
  join public.order_items oi  on oi.id = bi.order_item_id
  join public.orders o        on o.id  = oi.order_id
  where bi.tenant_id = p_tenant and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by 1, 2, 3 order by 4 desc;
$function$;

CREATE OR REPLACE FUNCTION public.report_hour_dow(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(dow integer, hour integer, revenue bigint, bill_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    extract(dow  from b.business_at at time zone 'Asia/Ho_Chi_Minh')::int,
    extract(hour from b.business_at at time zone 'Asia/Ho_Chi_Minh')::int,
    coalesce(sum(b.total), 0)::bigint,
    count(*)::bigint
  from public.bills_revenue b
  where b.tenant_id = p_tenant and b.status = 'paid' and b.split_count is null
    and b.business_at >= p_from and b.business_at < p_to
  group by 1, 2 order by 1, 2;
$function$;

CREATE OR REPLACE FUNCTION public.report_payments(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(method text, amount bigint, count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.method, coalesce(sum(p.amount), 0)::bigint, count(*)::bigint
  from public.payments p
  join public.bills_revenue b on b.id = p.bill_id
  where p.tenant_id = p_tenant
    and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 2 desc;
$function$;

CREATE OR REPLACE FUNCTION public.report_series(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_grain text DEFAULT 'day'::text)
 RETURNS TABLE(bucket_start timestamp with time zone, revenue bigint, bill_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    (date_trunc(
       case when p_grain in ('hour','day','week','month') then p_grain else 'day' end,
       b.business_at at time zone 'Asia/Ho_Chi_Minh'
     ) at time zone 'Asia/Ho_Chi_Minh'),
    coalesce(sum(b.total), 0)::bigint,
    count(*)::bigint
  from public.bills_revenue b
  where b.tenant_id = p_tenant and b.status = 'paid' and b.split_count is null
    and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 1;
$function$;

CREATE OR REPLACE FUNCTION public.report_summary(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(total_revenue bigint, bill_count bigint, avg_per_bill bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    coalesce(sum(b.total), 0)::bigint,
    count(*)::bigint,
    coalesce(round(avg(b.total)), 0)::bigint
  from public.bills_revenue b
  where b.tenant_id = p_tenant and b.status = 'paid' and b.split_count is null
    and b.business_at >= p_from and b.business_at < p_to;
$function$;

CREATE OR REPLACE FUNCTION public.report_top_items(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer DEFAULT 10)
 RETURNS TABLE(name text, qty bigint, revenue bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(oi.name_snapshot, '—'), sum(bi.qty_allocated)::bigint, sum(bi.amount)::bigint
  from public.bill_items bi
  join public.bills_revenue b on b.id = bi.bill_id
  join public.order_items oi  on oi.id = bi.order_item_id
  where bi.tenant_id = p_tenant and b.status = 'paid'
    and b.business_at >= p_from and b.business_at < p_to
  group by 1 order by 2 desc, 3 desc
  limit greatest(p_limit, 1);
$function$;

CREATE OR REPLACE FUNCTION public.takeaway_paid_total(p_tenant uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_root_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(paid_total bigint, paid_bills bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(b.total), 0)::bigint, count(*)::bigint
  from public.bills_revenue b
  join public.orders o on o.id = b.online_order_id
  where b.tenant_id = p_tenant and b.status = 'paid' and b.split_count is null
    and o.channel = 'takeaway' and o.parent_order_id is null
    and (
      case when p_root_ids is null
           then b.business_at >= p_from and b.business_at < p_to
           else o.id = any(p_root_ids)
      end
    );
$function$;

-- ---- handle_new_user: sinh profile khi có auth user mới ---------------------
-- Trigger trên auth.users. Thiếu nó, môi trường mới dựng từ repo sẽ không sinh profile.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---- has_role: CỐ Ý KHÔNG chụp lại ----------------------------------------
--
-- Hàm này tồn tại trên production nhưng KHÔNG tái tạo được: thân nó đọc `memberships.status`,
-- mà bảng memberships không có cột đó (chỉ có `active`). Postgres kiểm thân hàm SQL lúc tạo nên
-- `create or replace` báo ngay: column "status" does not exist. Nó sống sót được là vì được tạo
-- từ thời schema còn khác.
--
-- Ba policy `menu_images_insert` / `_update` / `_delete` trên storage.objects đều gọi hàm này,
-- nên chúng cũng chết theo — gọi là lỗi, không phải "từ chối". Chưa ai thấy vì
-- `lib/storage/images.ts` dùng service-role, bỏ qua RLS hoàn toàn.
--
-- Sửa (`status` → `active`) hay bỏ hẳn cả hàm lẫn 3 policy là quyết định về HÀNH VI, không thuộc
-- một migration chụp-hiện-trạng. Xem QD-013; xử lý ở migration riêng.

-- ---- Dọn 3 hàm tàn dư thật sự -----------------------------------------------
-- Không policy nào (đã rà MỌI schema, không chỉ public), không hàm nào gọi, không lời gọi
-- ".rpc(" nào trong app. Chữ ký lấy từ pg_get_function_identity_arguments, không đoán —
-- cả ba đều nhận uuid chứ không phải text; sai chữ ký thì "drop if exists" im lặng bỏ qua.
drop function if exists public.current_tenant_ids();
drop function if exists public.accept_invitation(uuid);
drop function if exists public.resolve_table_by_qr(uuid);
