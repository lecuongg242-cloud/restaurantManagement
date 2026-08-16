-- 0031_bills_unsplit_rpc.sql — Gỡ chia đều trong MỘT thao tác nguyên tử (BILL-06, việc còn tồn).
--
-- LÝ DO 1 — VOID THAY VÌ XÓA:
-- Bản cũ gỡ chia bằng cách XÓA các hóa đơn con. `payments.bill_id` là `on delete cascade`
-- (0012_bills_core.sql), nên chỉ cần lọt MỘT con đã thu là dòng tiền khách trả bốc hơi theo,
-- không để lại dấu vết nào. Cả một lớp guard ở tầng app dựng lên chỉ để chặn đúng điều đó.
-- Đánh dấu `status='void'` gỡ tận gốc: `payments` không còn đường nào cascade mất, `bill_no` đã
-- cấp không bị dùng lại (nextBillNo lấy max(bill_no) không lọc status), và thao tác thành UPDATE.
-- KHÔNG cần nới `bills_status_check`: 0012 đã khai `check (status in ('open','paid','void'))`
-- ngay từ đầu (đã đối chiếu pg_constraint trên DB thật) — 'void' hợp lệ sẵn.
--
-- LÝ DO 2 — MỘT TRANSACTION:
-- Chuỗi ở tầng app là 3 lượt gọi mạng rời: void các con → bỏ cờ `split_count` của vỏ → tính lại
-- tổng. Đứt giữa chừng ở nhịp đầu thì vỏ vẫn mang `split_count` trong khi con đã void: mọi mutator
-- của lib/billing/bill.ts đều từ chối vỏ, mà vỏ thì không thu trực tiếp được → bàn KHÓA CỨNG,
-- không thu được bằng đường nào. Dồn hai lệnh ghi + toàn bộ điều kiện xuống một function để
-- Postgres lo tính nguyên tử.
--
-- KHÓA (chống đua với payBill — "2 thu ngân cùng bàn", 0012):
-- `for update` trên vỏ rồi trên các con trước khi đếm tiền. `insert into payments` phải lấy
-- `for key share` trên đúng dòng `bills` được tham chiếu, mà khóa đó xung đột với `for update`,
-- nên lượt thu tiền chen ngang sẽ CHỜ tới khi lượt gỡ này xong — không còn khe giữa "đọc thấy
-- chưa ai thu" và "ghi void".
--
-- BẢO MẬT: `security invoker` ⇒ RLS tenant (0002/0012) áp nguyên vẹn; thêm `tenant_id = p_tenant`
-- tường minh ở mọi mệnh đề where (phòng thủ nhiều lớp, giống 0023_report_rpcs.sql).

create or replace function public.unsplit_bill_evenly(
  p_tenant uuid,
  p_bill   uuid,
  p_actor  uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_status      text;
  v_split_count int;
  v_blocked     int;
  v_voided      int;
begin
  -- Vỏ: khóa trước khi đọc trạng thái, để hai thu ngân cùng bấm "Gỡ chia" thì người sau đọc lại
  -- được kết quả của người trước (split_count đã null → 'not_split') chứ không gỡ chồng lên nhau.
  select b.status, b.split_count
    into v_status, v_split_count
    from public.bills b
   where b.id = p_bill
     and b.tenant_id = p_tenant
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_status <> 'open' or v_split_count is null then
    return jsonb_build_object('ok', false, 'code', 'not_split');
  end if;

  -- Khóa các con (order by id: thứ tự khóa cố định, tránh deadlock khi hai lượt gỡ giao nhau).
  -- `perform` vì `for update` không dùng chung được với hàm tổng hợp.
  perform 1
     from public.bills c
    where c.tenant_id = p_tenant
      and c.split_parent_id = p_bill
    order by c.id
      for update;

  -- Chốt bảo vệ tiền: con đã rời 'open' (đang/đã thu) HOẶC đã có dòng payments nào (thu chưa đủ
  -- nên bill còn 'open') thì từ chối CẢ LƯỢT. Hoàn tiền là việc của người thật, không tự động hóa.
  select count(*)
    into v_blocked
    from public.bills c
   where c.tenant_id = p_tenant
     and c.split_parent_id = p_bill
     and (
       c.status <> 'open'
       or exists (
         select 1 from public.payments p
          where p.tenant_id = p_tenant and p.bill_id = c.id
       )
     );
  if v_blocked > 0 then
    return jsonb_build_object('ok', false, 'code', 'has_payment');
  end if;

  -- `closed_by` = người ĐÓNG hóa đơn (0012). Void chính là đóng nó, nên ghi người bấm gỡ chia vào
  -- đây là đúng nghĩa cột — và không cột nào của báo cáo đọc `closed_by`, nên không làm lệch số.
  -- Ghi thêm dấu vào `note` để người mở bảng `bills` biết vì sao dòng này void.
  update public.bills
     set status     = 'void',
         closed_by  = coalesce(p_actor, closed_by),
         note       = coalesce(note || ' · ', '') || 'Đã gỡ chia',
         updated_at = now()
   where tenant_id = p_tenant
     and split_parent_id = p_bill
     and status = 'open';
  get diagnostics v_voided = row_count;

  -- Vỏ trở lại hóa đơn thường. Vỏ giữ nguyên `bill_items` từ lúc chia nên tầng app chỉ cần tính
  -- lại tổng là về đúng con số trước khi chia.
  update public.bills
     set split_count = null,
         updated_at  = now()
   where id = p_bill
     and tenant_id = p_tenant;

  -- Vỏ MỒ CÔI (còn cờ chia đều, 0 con — di chứng của một lượt gỡ hỏng giữa chừng thời bản cũ)
  -- rơi đúng vào đây với v_voided = 0: không có gì để void, chỉ bỏ cờ. Đó là kết quả HỢP LỆ,
  -- không phải lỗi — nếu từ chối thì bill đó không thu được bằng đường nào.
  return jsonb_build_object('ok', true, 'voided', v_voided);
end;
$$;

-- security invoker ⇒ RLS lọc theo tenant của người gọi. Chỉ mở cho user đã đăng nhập.
grant execute on function public.unsplit_bill_evenly(uuid, uuid, uuid) to authenticated;
