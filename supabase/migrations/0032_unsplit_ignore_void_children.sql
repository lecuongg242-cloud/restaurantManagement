-- 0032_unsplit_ignore_void_children.sql — Gỡ chia đều LẦN THỨ HAI phải chạy được.
--
-- LỖI CỦA 0031: chốt bảo vệ tiền đếm MỌI hóa đơn con có `split_parent_id = p_bill`, kể cả con đã
-- `void` của lượt gỡ TRƯỚC. Vì 0031 chọn void thay vì xóa, con void nằm lại vĩnh viễn và vẫn mang
-- `split_parent_id`, nên điều kiện `c.status <> 'open'` đúng với chúng ⇒ `v_blocked > 0` ⇒ trả
-- 'has_payment'. Chuỗi tái hiện: chia đều → gỡ → chia lại (splitBillEvenly chỉ xét cờ của chính vỏ
-- nên cho phép) → gỡ lần hai → BỊ TỪ CHỐI dù chưa ai thu một đồng. Hậu quả: vỏ kẹt `split_count`,
-- các chốt chặn thêm/hủy/duyệt món khóa luôn bàn đó, BILL-06 mất lối thoát duy nhất, và thu ngân
-- đọc câu "Đã thu một phần — hoàn tiền phần đã thu trước" rồi đi tìm khoản tiền không tồn tại.
--
-- SỬA: loại `status = 'void'` khỏi CẢ hai chỗ đọc con — khóa hàng và phép đếm. Con void là dấu vết
-- của một lượt chia ĐÃ GỠ XONG, không phải phần đang thu dở của lượt hiện tại. Con 'paid' và con
-- 'open' có payments vẫn chặn y như cũ: đó mới là tiền thật.
--
-- KHÔNG sửa 0031 (đã áp lên DB thật) — `create or replace` ở migration mới là đường duy nhất.
-- Mọi ghi chú thiết kế khác (void thay vì xóa, một transaction, khóa chống đua với payBill,
-- security invoker + lọc tenant tường minh) giữ nguyên như 0031.

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

  -- Khóa các con của LƯỢT CHIA HIỆN TẠI (order by id: thứ tự khóa cố định, tránh deadlock khi hai
  -- lượt gỡ giao nhau). Con 'void' là tàn dư của lượt chia trước, không ai còn thu vào chúng được
  -- nữa nên không cần khóa. `perform` vì `for update` không dùng chung được với hàm tổng hợp.
  perform 1
     from public.bills c
    where c.tenant_id = p_tenant
      and c.split_parent_id = p_bill
      and c.status <> 'void'
    order by c.id
      for update;

  -- Chốt bảo vệ tiền: con đã rời 'open' (đang/đã thu) HOẶC đã có dòng payments nào (thu chưa đủ
  -- nên bill còn 'open') thì từ chối CẢ LƯỢT. Hoàn tiền là việc của người thật, không tự động hóa.
  -- Bỏ con 'void': lượt gỡ trước đã kết luận chúng KHÔNG có tiền (nếu có thì lượt đó đã bị chặn),
  -- đếm lại chúng là tự chặn vĩnh viễn mọi lượt gỡ sau.
  select count(*)
    into v_blocked
    from public.bills c
   where c.tenant_id = p_tenant
     and c.split_parent_id = p_bill
     and c.status <> 'void'
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

-- 0031 hứa trong comment "Chỉ mở cho user đã đăng nhập" nhưng không thu quyền mặc định, nên ACL
-- thật vẫn còn PUBLIC + anon. Thu về cho khớp lời hứa: khách vãng lai (anon) không có việc gì gọi
-- RPC gỡ chia. (RLS + lọc p_tenant vốn đã khiến anon chỉ nhận 'not_found' — đây là lớp thứ hai.)
revoke execute on function public.unsplit_bill_evenly(uuid, uuid, uuid) from public;
revoke execute on function public.unsplit_bill_evenly(uuid, uuid, uuid) from anon;
grant execute on function public.unsplit_bill_evenly(uuid, uuid, uuid) to authenticated;
