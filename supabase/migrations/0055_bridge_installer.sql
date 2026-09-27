-- 0055_bridge_installer.sql — Bucket chứa BỘ CÀI CẦU IN chung (PRINT-17).
-- Chủ quán tải `cau-in.zip` ngay ở Admin → Máy in thay vì nhận qua Zalo/USB. Bộ cài không có mật khẩu
-- (PRINT-11) nhưng bucket vẫn KHÔNG công khai: server kiểm owner/manager rồi mới cấp link ký hạn 60 giây.
-- Ghi (print-pack.ps1 -Upload) chỉ qua service role. 50 MB = trần mỗi file của gói Supabase miễn phí.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bridge-installer', 'bridge-installer', false, 52428800, array['application/zip'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Không có policy nào cho anon/authenticated → họ không đọc/ghi được object của bucket này.
-- Policy tường minh cho service_role để tài liệu hóa ý định (service_role vốn bỏ qua RLS).
drop policy if exists bridge_installer_service_all on storage.objects;
create policy bridge_installer_service_all on storage.objects
  for all
  to service_role
  using (bucket_id = 'bridge-installer')
  with check (bucket_id = 'bridge-installer');
