-- 0081_ingredient_measured_yield.sql — "% dùng được" TỰ TÍNH từ số đo, không gõ tay (chủ dự án 29/09/2026).
--
-- % dùng được = Σ(định lượng × số bán) ÷ Σ(lượng thực dùng) trên 14 ngày ĐÃ KIỂM KÊ gần nhất, cập nhật sau mỗi lần chốt sổ
-- (lib/inventory/yield.ts). Lượng thực dùng = tồn đầu + nhập + ra mẻ − vào mẻ − xuất hủy − tồn đếm cuối ngày. Chưa có ngày
-- kiểm kê nào → 100%. Cột yield_pct giữ nguyên (mọi công thức giá vốn / số phần đọc nó); thêm hai cột cho màn hiển thị.
-- Đo trước khi áp (29/09/2026): không nguyên liệu nào trên production có yield_pct khác 100 ⇒ không đổi số của ai.
alter table public.ingredients
  add column if not exists yield_days       integer not null default 0 check (yield_days >= 0),
  add column if not exists yield_updated_at timestamptz null;
