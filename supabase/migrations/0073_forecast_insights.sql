-- 0073 — Dự báo + nhận xét tuần (P18, AI-01..05, QD-025).
--
-- Job đêm (`scripts/du-bao-dem.mjs`, GitHub Actions 02:30 VN) TÍNH và GHI các bảng này bằng kết nối database của job
-- (cùng bí mật với sao lưu, QD-025 / 18-01 "không thêm quyền rộng hơn"). Màn admin CHỈ ĐỌC: chủ / quản lý của chính
-- chi nhánh (`manager_tenants`, 0068) — thu ngân, bếp, quán khác: 0 dòng. Không có policy ghi nào cho người dùng,
-- trừ phản hồi "Hữu ích / Không hữu ích".
--
-- Chỉ thêm bảng mới. Không đổi bảng / hàm cũ.

-- ---- 18-01: một lượt chạy mỗi quán mỗi đêm ------------------------------------------------------------------------
create table if not exists public.forecast_runs (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  run_date      date not null,                      -- ngày VN job chạy (dự báo từ ngày này trở đi)
  status        text not null check (status in ('ok', 'thieu-du-lieu', 'loi')),
  history_days  integer not null default 0,         -- số ngày CÓ BÁN trong lịch sử dùng để tính
  selling_weeks integer not null default 0,         -- số tuần có bán (điều kiện hiện: ≥ 6)
  mape_revenue  numeric(6, 2),                      -- % sai lệch trung bình, backtest 4 tuần
  mape_bills    numeric(6, 2),
  error         text,
  created_at    timestamptz not null default now(),
  primary key (tenant_id, run_date)
);

create table if not exists public.forecasts (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  run_date    date not null,
  target_date date not null,
  metric      text not null check (metric in ('revenue', 'bills', 'item_qty')),
  item_key    text,                                 -- món: menu_item_id / 'ten:…' (món đã xóa) / 'khac' (món mới gộp)
  item_name   text,
  value       numeric(14, 2) not null,
  low         numeric(14, 2),
  high        numeric(14, 2),
  holiday     boolean not null default false
);
create index if not exists forecasts_tenant_run_idx on public.forecasts (tenant_id, run_date, metric);

-- ---- 18-03: nhận xét tuần + bất thường ------------------------------------------------------------------------------
create table if not exists public.insights (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  week_start  date not null,                        -- thứ Hai của tuần được nhận xét (giờ VN)
  kind        text not null check (kind in ('weekly', 'anomaly')),
  body        text not null,
  facts       jsonb not null,                       -- số liệu đầu vào — không SĐT, không tên khách / nhân viên
  anomalies   jsonb not null default '[]'::jsonb,
  model       text,                                 -- nguồn đã viết: 'gemini:…' | 'groq:…' | 'cloudflare:…' | 'mau-cau'
  fallbacks   jsonb not null default '[]'::jsonb,   -- các nguồn đã thử mà hỏng (để đo tỉ lệ rơi xuống dự phòng)
  tokens_in   integer,
  tokens_out  integer,
  created_at  timestamptz not null default now()
);
create unique index if not exists insights_weekly_once on public.insights (tenant_id, week_start) where kind = 'weekly';
create index if not exists insights_tenant_idx on public.insights (tenant_id, created_at desc);

create table if not exists public.insight_feedback (
  insight_id    bigint not null references public.insights(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  membership_id uuid not null,
  useful        boolean not null,
  created_at    timestamptz not null default now(),
  primary key (insight_id, membership_id)
);

-- ---- RLS ----------------------------------------------------------------------------------------------------------
alter table public.forecast_runs    enable row level security;
alter table public.forecasts        enable row level security;
alter table public.insights         enable row level security;
alter table public.insight_feedback enable row level security;

create policy forecast_runs_manager_read on public.forecast_runs
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
create policy forecasts_manager_read on public.forecasts
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
create policy insights_manager_read on public.insights
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));

-- Phản hồi: chủ / quản lý ghi phản hồi CỦA CHÍNH MÌNH cho nhận xét của quán mình.
create policy insight_feedback_manager_read on public.insight_feedback
  for select using (tenant_id = any (public.manager_tenants(array[tenant_id])));
create policy insight_feedback_manager_write on public.insight_feedback
  for insert with check (
    tenant_id = any (public.manager_tenants(array[tenant_id]))
    and membership_id in (select m.id from public.memberships m where m.user_id = auth.uid() and m.tenant_id = insight_feedback.tenant_id)
    and exists (select 1 from public.insights i where i.id = insight_id and i.tenant_id = insight_feedback.tenant_id)
  );
create policy insight_feedback_manager_update on public.insight_feedback
  for update using (
    tenant_id = any (public.manager_tenants(array[tenant_id]))
    and membership_id in (select m.id from public.memberships m where m.user_id = auth.uid() and m.tenant_id = insight_feedback.tenant_id)
  );

grant select on public.forecast_runs, public.forecasts, public.insights to authenticated;
grant select, insert, update on public.insight_feedback to authenticated;

notify pgrst, 'reload schema';
