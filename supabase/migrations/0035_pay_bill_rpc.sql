-- 0035_pay_bill_rpc.sql — Thu tiền + đóng hóa đơn trong MỘT thao tác nguyên tử.
--
-- LÝ DO 1 — HAI LƯỢT GHI RỜI LÀ GỐC CỦA MỌI LỖI Ở ĐƯỜNG NÀY:
-- `payBill` cũ ghi `payments` rồi mới `update bills` bằng hai lượt gọi mạng. Đứt giữa hai nhịp đó
-- để lại tiền đã ghi trên một hóa đơn còn 'open' — trạng thái mà không lớp nào tự dọn được, và
-- lượt thu lại sau đó ghi thêm MỘT DÒNG payments nữa (doanh thu gấp đôi). Mọi bản vá ở tầng app
-- (kiểm trước khi ghi, bắt 23505, cờ replay) đều chỉ là thu hẹp cửa sổ, vì cái cửa sổ đó nằm giữa
-- hai transaction khác nhau. Dồn cả điều kiện lẫn hai lệnh ghi xuống một function thì Postgres lo
-- tính nguyên tử — cửa sổ biến mất chứ không nhỏ đi.
--
-- LÝ DO 2 — ĐIỀU KIỆN "GỬI LẠI" PHẢI NEO VÀO HÓA ĐƠN, KHÔNG NEO VÀO KHÓA CLIENT:
-- Bản trước nhận diện lượt gửi lại bằng `idempotency_key` do client gửi, tra theo (tenant, key) mà
-- KHÔNG kèm bill. Đưa khóa đã dùng cho hóa đơn A vào lời gọi thu tiền hóa đơn B là B được đóng
-- 'paid' mà KHÔNG có dòng payments nào — tiền biến mất khỏi sổ thu trong khi báo cáo (lọc
-- `bills.status='paid'`) vẫn cộng doanh thu. Fail-open trên bảng tiền, lại tin vào client.
--
-- Điều kiện đúng và MẠNH HƠN HẲN: "hóa đơn này đã có payment chưa". Hệ thống không hỗ trợ thu từng
-- phần — đã đo trên DB thật trước khi viết: 0/2182 hóa đơn có nhiều hơn một payment, 0 hóa đơn
-- 'open' đang giữ payment, và `payments.amount` luôn bằng `bills.total` (0 dòng lệch). Nên "đã có
-- payment" nhận diện được đúng cái cần nhận diện, mà không phụ thuộc client cư xử tử tế.
--
-- Khóa idempotent vẫn giữ, làm LỚP THỨ HAI và chỉ ở đúng chỗ nó cần thiết: phân biệt "gửi lại một
-- lần bấm đã thành công" (hóa đơn đã 'paid' — trả kết quả cũ như một lần thành công) với "cố thu
-- lần nữa một hóa đơn đã chốt" (không có khóa khớp — giữ nguyên chốt fail-closed 'not_open' như bản
-- cũ). Khóa nay luôn được tra KÈM `bill_id`, nên khóa của hóa đơn khác không còn cửa nào.
--
-- KHÓA HÀNG (chống đua — "2 thu ngân cùng bàn", 0012; và chống đua với `unsplit_bill_evenly` 0031):
-- `for update` trên dòng `bills` trước khi đọc trạng thái. Hai lượt thu cùng lúc thì người sau CHỜ,
-- rồi đọc lại thấy 'paid' và đi đường gửi lại — không còn khe giữa "đọc thấy chưa ai thu" và "ghi".
-- Cùng loại khóa mà 0031 lấy, nên hai thao tác tự loại trừ nhau.
--
-- PHẦN ĐUÔI (gom con→vỏ 'paid', đánh `order_items` → 'served', đóng phiên bàn, hoàn tất đơn online)
-- CỐ Ý ĐỂ NGOÀI function này — xem ghi chú ở `payBill` (lib/billing/bill.ts). Tóm tắt: nó cần gọi
-- Realtime broadcast (không làm được trong SQL) và nó là trạng thái DẪN XUẤT, tự hội tụ khi chạy
-- lại. Thứ bắt buộc phải nguyên tử là "dòng tiền + trạng thái hóa đơn", và đó đúng là thứ nằm đây.
--
-- BẢO MẬT: `security invoker` ⇒ RLS tenant (0002/0012) áp nguyên vẹn; thêm `tenant_id = p_tenant`
-- tường minh ở mọi mệnh đề where (phòng thủ nhiều lớp, giống 0023/0031).

create or replace function public.pay_bill(
  p_tenant  uuid,
  p_bill    uuid,
  p_method  text,
  p_paid_at timestamptz,
  p_note    text default null,
  p_actor   uuid default null,
  p_idem    uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_status      text;
  v_total       int;
  v_split_count int;
  v_has_payment boolean;
  v_key_match   boolean;
  v_key_taken   boolean;
  v_idem        uuid;
begin
  -- Khóa TRƯỚC khi đọc: mọi quyết định bên dưới phải dựa trên trạng thái không ai đổi được nữa.
  select b.status, b.total, b.split_count
    into v_status, v_total, v_split_count
    from public.bills b
   where b.id = p_bill
     and b.tenant_id = p_tenant
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select exists (
           select 1 from public.payments p
            where p.tenant_id = p_tenant and p.bill_id = p_bill
         ),
         (p_idem is not null and exists (
           select 1 from public.payments p
            where p.tenant_id = p_tenant and p.bill_id = p_bill and p.idempotency_key = p_idem
         ))
    into v_has_payment, v_key_match;

  -- GỬI LẠI một lần bấm ĐÃ XONG HẲN: hóa đơn 'paid' + đúng khóa của lần bấm đó, trên CHÍNH hóa đơn
  -- này. Trả kết quả cũ như một lần thành công — nơi gọi vẫn chạy phần đuôi (có thể lượt trước chết
  -- ngay sau khi đóng bill).
  if v_status = 'paid' and v_key_match then
    return jsonb_build_object('ok', true, 'replayed', true, 'total', v_total);
  end if;

  -- Không khớp khóa ⇒ đây là một lượt thu MỚI nhắm vào hóa đơn đã chốt. Giữ nguyên chốt fail-closed
  -- của bản cũ: từ chối, để thu ngân nhìn lại chứ không lặng lẽ báo "đã thu".
  if v_status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'not_open');
  end if;
  if v_split_count is not null then
    return jsonb_build_object('ok', false, 'code', 'split_shell');
  end if;
  if v_total <= 0 then
    return jsonb_build_object('ok', false, 'code', 'empty_total');
  end if;

  -- Khóa client gửi lên ĐANG THUỘC VỀ HÓA ĐƠN KHÁC ⇒ nó không phải danh tính hợp lệ của lượt thu
  -- này (client lỗi, hoặc ai đó gọi thẳng action). Ghi kèm nó sẽ đâm `uniq_payments_idempotency_key`
  -- (0034) và ném 23505 ra khỏi function — tức MỘT KHÓA SAI CHẶN ĐỨNG việc thu tiền của một hóa đơn
  -- hợp lệ. Với nhà hàng đang bán thì "không thu được tiền" là hỏng nặng hơn "mất một lớp phòng thủ
  -- phụ", nên: BỎ khóa đi (ghi null) và thu bình thường.
  --
  -- An toàn không suy giảm: lớp chống trùng THẬT là `v_has_payment` — neo vào hóa đơn, không cần
  -- khóa. Lượt gửi lại sau đó vẫn thấy hóa đơn đã có tiền và vẫn không ghi dòng thứ hai.
  select exists (
           select 1 from public.payments p
            where p.tenant_id = p_tenant and p.idempotency_key = p_idem and p.bill_id <> p_bill
         ) into v_key_taken;
  v_idem := case when p_idem is null or v_key_taken then null else p_idem end;

  -- Hóa đơn còn 'open' mà đã có payment = lượt thu trước chết đúng giữa hai bước (dưới bản cũ). KHÔNG
  -- ghi thêm dòng nào — chỉ chạy nốt phần còn dở là đóng hóa đơn. Đây là đường tự chữa lành, và là
  -- lý do điều kiện gửi lại phải neo vào hóa đơn: nó đúng kể cả khi client không gửi khóa nào.
  if not v_has_payment then
    insert into public.payments (
      tenant_id, bill_id, method, amount, received_at, received_by, note, idempotency_key
    ) values (
      p_tenant, p_bill, p_method, v_total, p_paid_at, p_actor, p_note, v_idem
    );
  end if;

  -- `amount` lấy `v_total` đọc DƯỚI KHÓA, không lấy số tầng app đọc trước đó: giữa hai thời điểm ấy
  -- hóa đơn có thể vừa được giảm giá / thêm món.
  update public.bills
     set status     = 'paid',
         paid_at    = p_paid_at,
         closed_by  = p_actor,
         updated_at = now()
   where id = p_bill
     and tenant_id = p_tenant
     and status = 'open';

  -- `key_reused` không đổi hành vi phía app; để đây làm dấu vết đọc được khi cần truy vì sao một
  -- dòng payments không mang khóa nào.
  return jsonb_build_object(
    'ok', true, 'replayed', v_has_payment, 'total', v_total, 'key_reused', v_key_taken
  );
end;
$$;

-- security invoker ⇒ RLS lọc theo tenant của người gọi. Chỉ mở cho user đã đăng nhập.
grant execute on function public.pay_bill(uuid, uuid, text, timestamptz, text, uuid, uuid) to authenticated;
