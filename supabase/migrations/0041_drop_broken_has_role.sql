-- 0041_drop_broken_has_role.sql — Bỏ `has_role` hỏng và 3 policy chết ăn theo (QD-013 §2).
--
-- VẤN ĐỀ: `has_role(p_tenant_id uuid, p_roles text[])` đọc `memberships.status`. Bảng
-- `memberships` KHÔNG có cột đó — chỉ có `active` (xem 0001). Gọi hàm là lỗi ngay:
--
--   select public.has_role('…'::uuid, array['owner'])
--   → ERROR: column "status" does not exist
--
-- Hàm sống sót được vì nó được tạo từ thời schema còn khác; Postgres chỉ kiểm thân hàm SQL lúc
-- TẠO, không kiểm lại khi bảng đổi. Cũng vì vậy `0040` không chụp lại được nó.
--
-- Ba policy `menu_images_insert` / `_update` / `_delete` trên `storage.objects` đều gọi hàm này
-- và đều gắn cho PUBLIC. Một policy mà biểu thức ném lỗi thì KHÔNG phải "từ chối có kiểm soát" —
-- cả truy vấn đổ lỗi. Chưa ai gặp vì `lib/storage/images.ts` upload bằng service-role, đi qua
-- nhánh `menu_images_service_write` và bỏ qua RLS.
--
-- VÌ SAO BỎ CHỨ KHÔNG SỬA: V1 đã chốt mô hình upload ảnh qua service-role (`0005`). Ba policy kia
-- là tàn dư của một thiết kế không đi tiếp. Sửa `status` → `active` chỉ để hồi sinh một lối đi
-- không ai dùng, đổi lấy việc phải kiểm lại toàn bộ luồng upload. Giữ nguyên thì tệ hơn cả hai:
-- để lại một quả mìn cho người sau chuyển upload sang phiên người dùng và gặp lỗi khó hiểu.
--
-- AN TOÀN: hai policy gánh luồng thật KHÔNG bị đụng —
--   • menu_images_public_read  [SELECT, PUBLIC]        → khách vẫn xem được ảnh món
--   • menu_images_service_write [ALL, service_role]    → app vẫn upload/xoá được
-- Xoá 3 policy PUBLIC ghi kia chỉ gỡ đi các nhánh vốn luôn ném lỗi.

drop policy if exists menu_images_insert on storage.objects;
drop policy if exists menu_images_update on storage.objects;
drop policy if exists menu_images_delete on storage.objects;

drop function if exists public.has_role(uuid, text[]);
