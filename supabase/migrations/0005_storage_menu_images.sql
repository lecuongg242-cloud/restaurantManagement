-- 0005_storage_menu_images.sql — Bucket Storage ảnh menu + logo (P2 / plan 02-01).
-- Bucket public read (ảnh vốn hiển thị cho khách). Ghi/xóa CHỈ qua service role
-- (server action) — D15 / QD-005 §4. Logo tenant (02-04) dùng chung bucket này
-- (path {tenant_id}/logo-*). KHÔNG cho anon/authenticated ghi trực tiếp.

-- ---- Bucket -----------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

-- ---- Policy storage.objects cho bucket menu-images --------------------------
-- Đọc: public (ai cũng xem được ảnh menu/logo).
drop policy if exists menu_images_public_read on storage.objects;
create policy menu_images_public_read on storage.objects
  for select
  using (bucket_id = 'menu-images');

-- Ghi/sửa/xóa: chỉ service_role (server action dùng admin client). anon/authenticated
-- KHÔNG khớp vì không có policy INSERT/UPDATE/DELETE cấp cho họ; service_role bỏ qua RLS.
-- (Policy tường minh dưới đây để tài liệu hóa ý định.)
drop policy if exists menu_images_service_write on storage.objects;
create policy menu_images_service_write on storage.objects
  for all
  to service_role
  using (bucket_id = 'menu-images')
  with check (bucket_id = 'menu-images');
