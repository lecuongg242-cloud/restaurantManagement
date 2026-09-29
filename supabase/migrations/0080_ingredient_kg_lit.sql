-- 0080_ingredient_kg_lit.sql — Đơn vị trừ kho thêm kg và lít (chủ dự án 29/09/2026, như KiotViet / CUKCUK cho chọn thẳng kg).
--
-- Chỉ nới ràng buộc; dữ liệu cũ (g / ml / cái) giữ nguyên. Số lượng sổ kho / định lượng vẫn numeric(…, 3): theo kg thì nhỏ nhất
-- là 0,001 kg = 1 g — định lượng dưới 1 g (gia vị) nên khai theo gam (đã báo chủ dự án khi chọn).
alter table public.ingredients drop constraint if exists ingredients_base_unit_check;
alter table public.ingredients add constraint ingredients_base_unit_check
  check (base_unit in ('g', 'ml', 'cai', 'kg', 'l'));
