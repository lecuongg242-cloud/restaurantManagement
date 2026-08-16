-- 0034_idempotency_keys.sql — Khóa idempotent cho đường TẠO ĐƠN và đường THANH TOÁN.
--
-- VẤN ĐỀ: máy POS chạy WiFi trong nhà hàng. Nhân viên bấm "Gửi đơn" → server commit xong → mạng rớt
-- trước khi phản hồi về. Giao diện báo mất kết nối, giỏ hàng còn nguyên, nhân viên bấm gửi lại ⇒ bếp
-- làm hai lần, khách trả hai suất. Y hệt với thu tiền: `payments` sinh hai dòng cho cùng một lần thu.
--
-- KHÓA SINH Ở CLIENT, KHÔNG Ở SERVER: server không phân biệt được "người dùng bấm hai lần CỐ Ý cho
-- hai đơn khác nhau" với "một lần bấm bị gửi lại". Chỉ client biết đâu là MỘT hành động của người
-- dùng — một lần bấm = một khóa, mọi lượt gửi lại của chính lần bấm đó mang lại đúng khóa cũ.
--
-- ĐỂ Ở CỘT TRÊN CHÍNH BẢNG NGHIỆP VỤ, không dựng bảng `idempotency_keys` riêng: khóa và bản ghi phải
-- sinh/mất CÙNG NHAU. `insertOrderGraph` cuộn lại bằng `delete from orders` khi lưu món hỏng — cột
-- nằm trên chính dòng đó nên khóa biến mất theo, lượt gửi lại sau đó tạo đơn mới (đúng ý). Bảng rời
-- thì khóa ở lại một mình và chặn oan lượt gửi lại của một đơn KHÔNG hề tồn tại.
--
-- PHẠM VI UNIQUE = (tenant_id, idempotency_key), KHÔNG phải (idempotency_key) một mình:
--  - mọi truy vấn tra lại bản ghi cũ đều lọc `tenant_id` tường minh (luật multi-tenant của dự án),
--    nên index này phục vụ thẳng đúng câu truy vấn đó;
--  - khóa do CLIENT gửi lên. Phạm vi toàn cục nghĩa là một client (lỗi hoặc cố ý) có thể chiếm chỗ
--    một khóa và làm hỏng lượt ghi của tenant KHÁC. Phạm vi tenant thì hậu quả tệ nhất chỉ nằm trong
--    chính tenant đó. Đây là lý do khác hẳn `uniq_bill_items_bill_order_item` (0033) — ở đó thêm
--    `tenant_id` làm ràng buộc YẾU đi vì `bill_id` vốn đã thuộc một tenant; ở đây `idempotency_key`
--    không neo vào cái gì cả, tenant chính là phạm vi duy nhất có nghĩa.
--
-- CHỊU ĐƯỢC DÒNG CŨ: 2.210 orders + 2.060 payments hiện có đều sẽ mang `idempotency_key = null`
-- (đã đếm trên DB thật trước khi áp; chưa có cột nào tên này). Index để PARTIAL `where
-- idempotency_key is not null` — không phải vì Postgres cấm nhiều NULL (mặc định NULLS DISTINCT nên
-- vẫn cho), mà để KHÔNG PHỤ THUỘC vào luật đó: người đọc sau không phải nhớ ngữ nghĩa NULL của
-- unique index, và index cũng không phải cõng hơn 4.000 dòng cũ không bao giờ tra tới.
--
-- KHÔNG DỌN KHÓA CŨ: khóa là một cột uuid (16 byte) trên dòng vốn đã phải giữ mãi để đối soát doanh
-- thu. Dọn nó đi = mở lại đúng cửa sổ mà migration này bịt, đổi lấy vài KB. Job dọn định kỳ còn là
-- một đường ghi mới trên bảng tiền — thêm rủi ro, không thêm gì.

-- ---- orders -----------------------------------------------------------------
alter table public.orders
  add column if not exists idempotency_key uuid;

create unique index if not exists uniq_orders_idempotency_key
  on public.orders (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- ---- payments ---------------------------------------------------------------
alter table public.payments
  add column if not exists idempotency_key uuid;

create unique index if not exists uniq_payments_idempotency_key
  on public.payments (tenant_id, idempotency_key)
  where idempotency_key is not null;
