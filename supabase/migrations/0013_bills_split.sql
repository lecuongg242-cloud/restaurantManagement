-- 0013_bills_split.sql — Tách/gộp bill (P4 / plan 04-02).
-- Hỗ trợ "chia đều N người" = N hóa đơn con mang total/N (không gắn món cụ thể).
--   split_parent_id : hóa đơn con trỏ về hóa đơn gốc (đã chia).
--   split_count     : hóa đơn gốc = số phần đã chia (≠ null ⇒ là "vỏ chứa", KHÔNG tính doanh thu).
-- Bất biến suất giữ nguyên cho tách-theo-món + gộp-bàn (di chuyển bill_items, không nhân order_item).
-- Doanh thu (04-05) = bills.status='paid' AND split_count IS NULL (loại vỏ chứa, đếm phần con).

alter table public.bills
  add column if not exists split_parent_id uuid references public.bills (id) on delete cascade;

alter table public.bills
  add column if not exists split_count int;

create index if not exists idx_bills_split_parent
  on public.bills (tenant_id, split_parent_id);
