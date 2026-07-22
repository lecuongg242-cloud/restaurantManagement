-- 0009_realtime_tables.sql — Thêm bảng tables vào publication realtime (fix 03-02/03).
-- POS subscribe postgres_changes cả tables để trạng thái bàn (occupied/available/…) sync
-- cross-window (vd đóng phiên ở POS này → bàn available hiện ngay ở POS/màn khác).
-- orders + order_items đã thêm ở 0008. (print_jobs của 03-05 chuyển sang 0010.)

alter publication supabase_realtime add table public.tables;
