-- 0037_cancel_after_print_rpcs.sql — Đo lượt hủy sau khi đã in phiếu bếp + ghi người duyệt giảm giá
-- (BILL-07, REPORT-11, REPORT-12).
--
-- MỤC ĐÍCH: CHỈ ĐO, KHÔNG KHÓA. Không đổi quyền hủy, không thêm chốt duyệt. Quán chưa biết mỗi
-- ngày có bao nhiêu lượt hủy sau khi in là chính đáng (khách đổi ý sau khi món đã làm là chuyện
-- thật), nên phải có số thật vài tuần rồi mới bàn tới việc siết.
--
-- SUY RA MỐC IN, KHÔNG THÊM CỘT: `print_jobs` đã có `created_at` + `payload->>'orderId'`. Mỗi lần
-- "Xác nhận thêm" tạo MỘT đơn riêng và `buildKitchenTicket` in theo `orderId`, nên một đơn = một
-- lượt in ⇒ mốc in ở mức ĐƠN là proxy hợp lệ cho "món này đã xuống bếp".
--
-- BA CHỖ DỄ SAI, xử lý tường minh ở mọi hàm dưới đây:
--   1. IN LẠI NHIỀU LẦN → luôn lấy `min(created_at)`, tức mốc SỚM NHẤT. Lấy mốc muộn nhất sẽ biến
--      một lượt hủy-sau-in thành hủy-trước-in chỉ vì sau đó có người bấm in lại.
--   2. TRẠNG THÁI `print_jobs` → KHÔNG lọc `status`. Theo đúng tiền lệ `getPosSnapshot`
--      (lib/orders/pos.ts): job `pending` đã đẩy sang cầu in nên vẫn tính là "đã in", còn job
--      `failed` để chip đỏ ở panel POS lo. Ở đây thà tính dư một mốc in (chỉ số RỘNG hơn, người
--      xem tự soi) còn hơn bỏ sót đúng ca cần nhìn.
--   3. DỮ LIỆU TRƯỚC 0028 → `order_items.cancelled_at` khi đó backfill bằng `created_at` (comment
--      trong 0028 nói rõ là XẤP XỈ). Đem mốc GỌI MÓN đi so với mốc in thì mọi dòng cũ đều thành
--      "hủy trước khi in" — kết luận sai. Nhận diện bằng `cancelled_at = created_at`: backfill đặt
--      hai cột bằng nhau chính xác, còn lượt hủy thật ghi `cancelled_at = now()` ở tầng app sau
--      lúc tạo dòng nên không bao giờ trùng. Dòng đó bị LOẠI khỏi cả tử số lẫn mẫu số và đếm
--      riêng vào `approx_qty` để màn hình nói thẳng "chưa xét được N món".
--
-- Khuôn giống 0023/0029: `language sql`, `stable`, `security invoker` (RLS tenant vẫn áp dụng),
-- `set search_path = public`, lọc `p_tenant` tường minh, khoảng nửa mở [p_from, p_to).

-- ---- 1. Người duyệt giảm giá (BILL-07) ---------------------------------------
-- Hệ thống ĐÃ bắt nhập PIN cho giảm giá rồi vứt kết quả đi: `applyBillAdjustment` chỉ ghi
-- discount_type/value/amount, không lưu ai duyệt. Chốt kiểm soát tồn tại mà không để lại bằng
-- chứng thì không kiểm được gì. Hai cột này là chỗ giữ bằng chứng đó.
--
-- Không thêm FK sang `memberships`: giống `order_items.cancelled_by` (0029), nhân sự nghỉ việc bị
-- xóa thì FK sẽ NUỐT MẤT chính những dòng cần soi. Tra tên bằng `left join`.
alter table public.bills add column if not exists discount_by uuid;
alter table public.bills add column if not exists discount_at timestamptz;

comment on column public.bills.discount_by is
  'Membership duyệt giảm giá (PIN gate, hoặc chính người đăng nhập khi là owner/manager). NULL = hóa đơn không giảm giá, hoặc lượt giảm có trước 0037.';
comment on column public.bills.discount_at is
  'Lúc duyệt giảm giá. Đi cùng discount_by: cùng ghi khi đặt giảm, cùng xóa khi bỏ giảm.';

-- ---- 2. Index đỡ tra mốc in --------------------------------------------------
-- Mọi hàm dưới đây tra `min(created_at)` của phiếu bếp theo `orderId` nằm trong jsonb. Không có
-- index này thì mỗi dòng hủy quét toàn bộ `print_jobs` của tenant.
create index if not exists idx_print_jobs_kitchen_order
  on public.print_jobs (tenant_id, (payload ->> 'orderId'), created_at)
  where type = 'kitchen_ticket';

-- ---- 3. Tổng quan "hủy sau khi đã in phiếu bếp" (REPORT-11) -------------------
create or replace function public.report_cancel_after_print_summary(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  after_qty         bigint,  -- món hủy SAU mốc in sớm nhất của đơn chứa nó
  after_amount      bigint,
  comparable_qty    bigint,  -- mẫu số: món hủy có mốc giờ THẬT (đã loại dòng backfill 0028)
  comparable_amount bigint,
  approx_qty        bigint   -- món hủy bị loại vì mốc giờ chỉ là xấp xỉ (trước 0028)
)
language sql
stable
security invoker
set search_path = public
as $$
  with c as (
    select
      oi.qty                                                as qty,
      (oi.unit_price_snapshot::bigint * oi.qty)             as amount,
      (oi.cancelled_at is distinct from oi.created_at)      as trusted,
      -- Đơn chưa in lần nào → first_printed_at IS NULL → phép so dưới ra NULL → không vào tử số.
      (oi.cancelled_at > pj.first_printed_at)               as after_print
    from public.order_items oi
    left join lateral (
      select min(j.created_at) as first_printed_at
      from public.print_jobs j
      where j.tenant_id = p_tenant
        and j.type = 'kitchen_ticket'
        and j.payload ->> 'orderId' = oi.order_id::text
    ) pj on true
    where oi.tenant_id = p_tenant
      and oi.status = 'cancelled'
      and oi.cancelled_at >= p_from
      and oi.cancelled_at <  p_to
  )
  select
    coalesce(sum(c.qty)    filter (where c.trusted and c.after_print), 0)::bigint,
    coalesce(sum(c.amount) filter (where c.trusted and c.after_print), 0)::bigint,
    coalesce(sum(c.qty)    filter (where c.trusted), 0)::bigint,
    coalesce(sum(c.amount) filter (where c.trusted), 0)::bigint,
    coalesce(sum(c.qty)    filter (where not c.trusted), 0)::bigint
  from c;
$$;

-- ---- 4. Theo người duyệt hủy + cột "sau khi in" (REPORT-11) -------------------
-- `create or replace` KHÔNG đổi được danh sách cột trả về ⇒ phải drop rồi create. Cả migration
-- chạy trong một transaction nên không có khoảng trống mà lời gọi cũ rơi vào "hàm không tồn tại".
-- Phần thân giữ nguyên 0029 (kể cả `left join memberships` để không nuốt mất dòng của nhân sự đã
-- xóa), chỉ thêm hai cột đuôi.
drop function if exists public.report_cancel_by_actor(uuid, timestamptz, timestamptz);
create function public.report_cancel_by_actor(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  membership_id uuid,
  display_name  text,
  role          text,
  cnt           bigint,
  qty           bigint,
  amount        bigint,
  after_qty     bigint,
  after_amount  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.cancelled_by,
    coalesce(m.display_name, '—'),
    coalesce(m.role, ''),
    count(*)::bigint,
    sum(oi.qty)::bigint,
    sum(oi.unit_price_snapshot::bigint * oi.qty)::bigint,
    coalesce(sum(oi.qty) filter (
      where oi.cancelled_at is distinct from oi.created_at and oi.cancelled_at > pj.first_printed_at
    ), 0)::bigint,
    coalesce(sum(oi.unit_price_snapshot::bigint * oi.qty) filter (
      where oi.cancelled_at is distinct from oi.created_at and oi.cancelled_at > pj.first_printed_at
    ), 0)::bigint
  from public.order_items oi
  left join public.memberships m
    on m.id = oi.cancelled_by and m.tenant_id = p_tenant
  left join lateral (
    select min(j.created_at) as first_printed_at
    from public.print_jobs j
    where j.tenant_id = p_tenant
      and j.type = 'kitchen_ticket'
      and j.payload ->> 'orderId' = oi.order_id::text
  ) pj on true
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  group by oi.cancelled_by, m.display_name, m.role
  order by sum(oi.unit_price_snapshot::bigint * oi.qty) desc;
$$;

-- ---- 5. Danh sách chi tiết + mốc in (REPORT-11) -------------------------------
-- Cũng phải drop/create vì thêm cột. Thân giữ nguyên 0029, thêm `printed_at`, `after_print`,
-- `time_approx`.
drop function if exists public.report_cancel_list(uuid, timestamptz, timestamptz, int, int);
create function public.report_cancel_list(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_limit  int default 20,
  p_offset int default 0
)
returns table (
  cancelled_at timestamptz,
  place        text,
  item_name    text,
  qty          int,
  amount       bigint,
  reason       text,
  actor_name   text,
  printed_at   timestamptz,  -- mốc in phiếu bếp SỚM NHẤT của đơn chứa món này; NULL = chưa in
  after_print  boolean,      -- hủy sau mốc đó; NULL khi chưa in hoặc mốc giờ không đáng tin
  time_approx  boolean       -- mốc giờ hủy chỉ là xấp xỉ (dòng backfill của 0028)
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.cancelled_at,
    coalesce(
      case when t.name is not null then 'Bàn ' || t.name end,
      case when o.kitchen_no is not null then 'Đơn #' || o.kitchen_no end,
      '—'
    ),
    oi.name_snapshot,
    oi.qty,
    (oi.unit_price_snapshot::bigint * oi.qty)::bigint,
    -- Hủy cả đơn chỉ ghi lý do ở `orders`; hủy lẻ ghi ở `order_items`. Lấy cái nào có.
    coalesce(nullif(oi.cancel_reason, ''), nullif(o.cancel_reason, ''), '—'),
    coalesce(m.display_name, '—'),
    pj.first_printed_at,
    case
      when oi.cancelled_at is not distinct from oi.created_at then null  -- mốc xấp xỉ: không kết luận
      else oi.cancelled_at > pj.first_printed_at
    end,
    (oi.cancelled_at is not distinct from oi.created_at)
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.table_sessions ts on ts.id = o.table_session_id
  left join public.tables t on t.id = ts.table_id
  left join public.memberships m on m.id = oi.cancelled_by and m.tenant_id = p_tenant
  left join lateral (
    select min(j.created_at) as first_printed_at
    from public.print_jobs j
    where j.tenant_id = p_tenant
      and j.type = 'kitchen_ticket'
      and j.payload ->> 'orderId' = oi.order_id::text
  ) pj on true
  where oi.tenant_id = p_tenant
    and oi.status = 'cancelled'
    and oi.cancelled_at >= p_from
    and oi.cancelled_at <  p_to
  order by oi.cancelled_at desc, oi.id desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- ---- 6. Đơn đã in · hủy toàn bộ · không có dòng payments (REPORT-11) ----------
-- BA điều kiện cùng lúc, đúng theo định nghĩa chủ quán chốt. KHÔNG thêm điều kiện thứ tư nào:
--   • "hủy toàn bộ" đọc từ CHÍNH các dòng món (mọi món đều 'cancelled', đơn có ít nhất 1 món) chứ
--     không đọc `orders.status` — roll-up trạng thái đơn nằm ở tầng app và có thể trượt (dữ liệu
--     thật đang có đơn `completed` mà mọi món đều đã hủy).
--   • "không có dòng payments" bám theo ĐÚNG các món của đơn này: order_items → bill_items →
--     payments. Đơn được thu qua bill đã tách/gộp vẫn tra ra vì `bill_items.order_item_id` giữ
--     nguyên khi tách.
-- KHÔNG lọc theo thứ tự in/hủy: hàm trả cả `printed_at` lẫn `cancelled_at` để người xem tự nhìn.
create or replace function public.report_cancel_full_signature(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz,
  p_limit  int default 20
)
returns table (
  order_id     uuid,
  cancelled_at timestamptz,  -- lúc món CUỐI CÙNG của đơn bị hủy = lúc đơn sạch món
  printed_at   timestamptz,
  place        text,
  qty          bigint,
  amount       bigint,
  reason       text,
  actor_name   text,
  actor_role   text,
  time_approx  boolean       -- có dòng backfill 0028 → mốc giờ chỉ là xấp xỉ
)
language sql
stable
security invoker
set search_path = public
as $$
  with touched as (
    -- Chặn quét cả bảng: chỉ xét đơn có ít nhất một món bị hủy TRONG KỲ (index
    -- idx_order_items_cancelled của 0028). `max(cancelled_at)` nằm trong kỳ luôn kéo theo điều
    -- kiện này, nên lọc trước không đổi kết quả.
    select distinct oi.order_id
    from public.order_items oi
    where oi.tenant_id = p_tenant
      and oi.status = 'cancelled'
      and oi.cancelled_at >= p_from
      and oi.cancelled_at <  p_to
  ), all_cancelled as (
    -- Điều kiện 2: đơn KHÔNG còn món nào ngoài 'cancelled'. Đọc từ chính các dòng món chứ không
    -- từ `orders.status` — roll-up trạng thái nằm ở tầng app và có thể trượt.
    select
      oi.order_id,
      max(oi.cancelled_at)                                        as cancelled_at,
      sum(oi.qty)::bigint                                         as qty,
      sum(oi.unit_price_snapshot::bigint * oi.qty)::bigint        as amount,
      bool_or(oi.cancelled_at is not distinct from oi.created_at) as time_approx,
      (array_agg(oi.cancelled_by  order by oi.cancelled_at desc nulls last))[1] as last_actor,
      (array_agg(oi.cancel_reason order by oi.cancelled_at desc nulls last))[1] as last_reason
    from public.order_items oi
    join touched tc on tc.order_id = oi.order_id
    where oi.tenant_id = p_tenant
    group by oi.order_id
    having count(*) filter (where oi.status <> 'cancelled') = 0
  )
  select
    o.id,
    a.cancelled_at,
    pj.first_printed_at,
    coalesce(
      case when t.name is not null then 'Bàn ' || t.name end,
      case when o.kitchen_no is not null then 'Đơn #' || o.kitchen_no end,
      '—'
    ),
    a.qty,
    a.amount,
    coalesce(nullif(o.cancel_reason, ''), nullif(a.last_reason, ''), '—'),
    coalesce(m.display_name, '—'),
    coalesce(m.role, ''),
    a.time_approx
  from all_cancelled a
  join public.orders o on o.id = a.order_id and o.tenant_id = p_tenant
  join lateral (
    select min(j.created_at) as first_printed_at
    from public.print_jobs j
    where j.tenant_id = p_tenant
      and j.type = 'kitchen_ticket'
      and j.payload ->> 'orderId' = o.id::text
  ) pj on pj.first_printed_at is not null   -- điều kiện 1: đã in phiếu bếp
  left join public.table_sessions ts on ts.id = o.table_session_id
  left join public.tables t on t.id = ts.table_id
  left join public.memberships m on m.id = a.last_actor and m.tenant_id = p_tenant
  where a.cancelled_at >= p_from
    and a.cancelled_at <  p_to
    -- điều kiện 3: không một đồng nào được thu cho bất kỳ món nào của đơn này.
    and not exists (
      select 1
      from public.order_items oi2
      join public.bill_items bi on bi.order_item_id = oi2.id and bi.tenant_id = p_tenant
      join public.payments   p  on p.bill_id = bi.bill_id     and p.tenant_id = p_tenant
      where oi2.order_id = o.id
        and oi2.tenant_id = p_tenant
    )
  order by a.cancelled_at desc
  limit greatest(p_limit, 1);
$$;

-- ---- 7. Giảm giá theo người duyệt (REPORT-12) --------------------------------
-- Lọc theo `paid_at` + quy ước doanh thu BILL-05 (`status='paid'`, `split_count is null`) để tỷ lệ
-- "giảm giá / doanh thu" có cùng MỘT mẫu số với KPI Doanh thu của trang. Lọc theo `discount_at` sẽ
-- đúng hơn về mặt "lúc duyệt" nhưng làm khối này rỗng trơn với mọi hóa đơn có trước 0037 —
-- những lượt giảm đã xảy ra thật, chỉ là chưa biết ai duyệt.
create or replace function public.report_discount_summary(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (bill_cnt bigint, discount_amount bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint,
    coalesce(sum(b.discount_amount), 0)::bigint
  from public.bills b
  where b.tenant_id = p_tenant
    and b.status = 'paid'
    and b.split_count is null
    and b.discount_amount > 0
    and b.paid_at >= p_from
    and b.paid_at <  p_to;
$$;

create or replace function public.report_discount_by_actor(
  p_tenant uuid,
  p_from   timestamptz,
  p_to     timestamptz
)
returns table (
  membership_id uuid,
  display_name  text,
  role          text,
  cnt           bigint,
  amount        bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    b.discount_by,
    coalesce(m.display_name, '—'),
    coalesce(m.role, ''),
    count(*)::bigint,
    coalesce(sum(b.discount_amount), 0)::bigint
  from public.bills b
  left join public.memberships m
    on m.id = b.discount_by and m.tenant_id = p_tenant
  where b.tenant_id = p_tenant
    and b.status = 'paid'
    and b.split_count is null
    and b.discount_amount > 0
    and b.paid_at >= p_from
    and b.paid_at <  p_to
  group by b.discount_by, m.display_name, m.role
  order by sum(b.discount_amount) desc;
$$;

-- ---- 8. Quyền ----------------------------------------------------------------
-- Bài học 0036: `grant` mà quên `revoke` thì PUBLIC/anon vẫn giữ EXECUTE, comment hứa một đằng ACL
-- một nẻo. `drop function` ở mục 4/5 cũng xóa sạch grant cũ nên phải cấp lại ở đây.
--
-- Thu luôn cho hai hàm còn lại của 0029: 0029 KHÔNG có dòng grant nào, tức chúng vẫn đang chạy
-- bằng EXECUTE mặc định của PUBLIC. Đây là siết, không phải nới — cả 4 hàm cùng họ về cùng một mức.
revoke execute on function public.report_cancel_summary(uuid, timestamptz, timestamptz)             from public, anon;
revoke execute on function public.report_cancel_top_items(uuid, timestamptz, timestamptz, int)      from public, anon;
revoke execute on function public.report_cancel_by_actor(uuid, timestamptz, timestamptz)            from public, anon;
revoke execute on function public.report_cancel_list(uuid, timestamptz, timestamptz, int, int)      from public, anon;
revoke execute on function public.report_cancel_after_print_summary(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.report_cancel_full_signature(uuid, timestamptz, timestamptz, int) from public, anon;
revoke execute on function public.report_discount_summary(uuid, timestamptz, timestamptz)           from public, anon;
revoke execute on function public.report_discount_by_actor(uuid, timestamptz, timestamptz)          from public, anon;

grant execute on function public.report_cancel_summary(uuid, timestamptz, timestamptz)             to authenticated;
grant execute on function public.report_cancel_top_items(uuid, timestamptz, timestamptz, int)      to authenticated;
grant execute on function public.report_cancel_by_actor(uuid, timestamptz, timestamptz)            to authenticated;
grant execute on function public.report_cancel_list(uuid, timestamptz, timestamptz, int, int)      to authenticated;
grant execute on function public.report_cancel_after_print_summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.report_cancel_full_signature(uuid, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.report_discount_summary(uuid, timestamptz, timestamptz)           to authenticated;
grant execute on function public.report_discount_by_actor(uuid, timestamptz, timestamptz)          to authenticated;
