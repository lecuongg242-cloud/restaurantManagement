-- 0050 — Giới hạn tần suất cho đường ẩn danh (TENANT-07, QD-019 D4, P11 11-03).
--
-- Mọi quán chung một database: một quán bị dội request là mọi quán cùng chậm. Bộ đếm cửa sổ cố định
-- nằm ngay trong Postgres — không thêm dịch vụ. Chỉ server (service_role) gọi; khóa đã được băm HMAC
-- ở app (IP là dữ liệu cá nhân), bảng không có tenant_id và không ai ngoài service_role chạm vào.

create table if not exists public.rate_limit_hits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);

-- Bật RLS, KHÔNG có policy nào ⇒ anon/authenticated không đọc/ghi được. service_role bỏ qua RLS.
alter table public.rate_limit_hits enable row level security;
revoke all on table public.rate_limit_hits from anon, authenticated;

-- Ghi một lượt vào cửa sổ hiện tại; trả true nếu vẫn trong ngưỡng.
-- Cửa sổ chia theo epoch (floor(now / p_window_s)) — khớp `retryAfterS` phía app.
create or replace function public.rate_limit_hit(p_key text, p_window_s integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if p_window_s is null or p_window_s <= 0 or p_max is null or p_max < 0 then
    raise exception 'tham so gioi han tan suat khong hop le' using errcode = '22023';
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);

  insert into public.rate_limit_hits as r (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Dọn theo xác suất (~1% lượt gọi): bảng không phình vô hạn, không cần pg_cron.
  -- Cửa sổ dài nhất đang dùng là 10 phút — giữ 1 giờ cho dư.
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 hour';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
