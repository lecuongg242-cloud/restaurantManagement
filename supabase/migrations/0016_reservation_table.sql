-- 0016_reservation_table.sql — Gán bàn cho đặt bàn (P5 bổ sung).
-- Thêm table_id (tùy chọn) để nhân viên biết đặt cho bàn nào. KHÔNG giữ bàn / không đổi
-- trạng thái bàn / không kiểm trùng lịch ở V1 (chỉ là thông tin — QD-008 D-P5-2 giữ nguyên
-- "không giữ bàn"). on delete set null: xóa bàn thì đặt bàn cũ vẫn còn, chỉ mất tham chiếu.

alter table public.reservations
  add column if not exists table_id uuid references public.tables (id) on delete set null;

create index if not exists idx_reservations_tenant_table
  on public.reservations (tenant_id, table_id);
