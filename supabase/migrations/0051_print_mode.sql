-- 0051 — Chế độ in theo từng quán (PRINT-10, QD-019 D5, P11 11-04).
--
-- Trước đây `NEXT_PUBLIC_PRINT_MODE` (nhúng lúc build) quyết định chế độ in cho MỌI quán. Nay mỗi quán
-- có `tenants.settings.print_mode` ('browser' | 'bridge'; thiếu = 'browser').
--
-- Chuyển tiếp — không quán đang chạy nào đổi hành vi: quán đang có tài khoản cầu in hoạt động
-- (membership 'printer', active) chính là quán đang dùng cầu in ⇒ 'bridge'. Quán đã tự chọn chế độ thì
-- KHÔNG ghi đè. Chỉ đổi dữ liệu, không đổi schema; chạy lại vô hại.
--
-- THỨ TỰ BẮT BUỘC: áp migration này TRƯỚC khi deploy code đọc `print_mode`, nếu không quán đang dùng cầu
-- in sẽ rơi về in trình duyệt giữa ca.

update public.tenants t
set settings = coalesce(t.settings, '{}'::jsonb) || jsonb_build_object('print_mode', 'bridge')
where exists (
    select 1
    from public.memberships m
    where m.tenant_id = t.id
      and m.role = 'printer'
      and m.active
  )
  and coalesce(t.settings ->> 'print_mode', '') = '';
