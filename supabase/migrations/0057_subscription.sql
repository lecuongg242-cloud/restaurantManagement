-- 0057_subscription.sql — Hạn dùng của quán + khóa tự động khi quá ân hạn (P13 / plan 13-03, QD-021 D6–D7).
--
-- VẤN ĐỀ: chỉ có công tắc tay `tenants.status = 'suspended'` (0039). Không có ngày hết hạn thì không
-- nhắc được, không khóa tự động được, không biết quán nào nợ.
--
-- CÁCH LÀM: cột `paid_until` (ngày). Rỗng = KHÔNG GIỚI HẠN — mọi quán hiện có (qt-food đang bán thật,
-- quán demo) để rỗng ⇒ áp migration này không khóa ai. Quá `paid_until` + ân hạn thì khóa ĐÚNG NHƯ
-- `suspended`: đi qua `auth_tenant_ids()` (mọi policy tenant) và `lib/tenant/active.ts` (bề mặt khách
-- chạy service-role, lọc bằng cột tính `usable` dưới đây). Không xóa dữ liệu; gia hạn là mở ngay.
--
-- "HÔM NAY" theo giờ Việt Nam, KHÔNG `current_date` (múi giờ phiên = UTC — bài học BUG-GioLechMuiGio),
-- và đổi ngày lúc 04:00 thay vì 00:00: quán đang mở bàn lúc nửa đêm không bị khóa giữa ca.
--
-- Hằng số 7 ngày ân hạn khớp `GRACE_DAYS` trong lib/tenant/subscription.ts; test
-- tests/rls/subscription.test.ts chạy cùng bảng ca qua cả hai.

alter table public.tenants add column if not exists paid_until date;

comment on column public.tenants.paid_until is
  'Ngày cuối cùng đã trả tiền thuê bao (giờ VN). NULL = không giới hạn. Quá paid_until + 7 ngày ân hạn thì khóa như suspended.';

-- Lõi, nhận "hôm nay" làm tham số để test đối chiếu được với TS mà không phải chỉnh đồng hồ DB.
-- KHÔNG `set search_path` và không đọc bảng nào: để Postgres inline được vào auth_tenant_ids() —
-- hàm đó nằm trong MỌI policy, không được đắt thêm.
create or replace function public.tenant_usable_on(p_status text, p_paid_until date, p_today date)
returns boolean
language sql
immutable
as $$
  select p_status = 'active'
     and (p_paid_until is null or p_today <= p_paid_until + 7)
$$;

create or replace function public.tenant_usable(p_status text, p_paid_until date)
returns boolean
language sql
stable
as $$
  select public.tenant_usable_on(
    p_status,
    p_paid_until,
    ((now() at time zone 'Asia/Ho_Chi_Minh') - interval '4 hours')::date
  )
$$;

-- Cột tính cho PostgREST: `.eq("usable", true)` ở lib/tenant/active.ts dùng ĐÚNG định nghĩa trên thay
-- vì chép điều kiện sang TS.
create or replace function public.usable(public.tenants)
returns boolean
language sql
stable
as $$
  select public.tenant_usable($1.status, $1.paid_until)
$$;

-- Thay điều kiện `t.status = 'active'` của 0039. Cùng chữ ký, `create or replace` (drop không được vì
-- mọi policy phụ thuộc hàm này) ⇒ không sinh overload. Giữ security definer + search_path như 0002/0039.
create or replace function public.auth_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid()
    and m.active
    and public.tenant_usable(t.status, t.paid_until)
$$;

-- `paid_until` do super-admin đặt (qua service role). Quyền cột của 0020 chỉ mở name/logo/cover/
-- settings cho authenticated nên owner KHÔNG tự gia hạn được — không cần đổi grant.
