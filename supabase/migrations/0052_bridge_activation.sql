-- 0052 — Mã kích hoạt cầu in (PRINT-11, QD-019 D6, P11 11-05).
--
-- Gói cài cầu in giống nhau cho mọi quán; người lắp gõ một mã 8 ký tự, server đổi thành tài khoản
-- `printer` của đúng quán. Chỉ lưu BẢN BĂM của mã.
--
-- Chỉ server (service_role) chạm bảng này: tạo mã ở /super (super-admin), đổi mã ở route
-- /api/bridge/activate. Bật RLS, KHÔNG policy nào ⇒ chủ quán / nhân viên / anon không đọc, không ghi.

create table if not exists public.bridge_activation_codes (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  code_hash   text        not null unique,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists idx_bridge_activation_codes_tenant
  on public.bridge_activation_codes (tenant_id, created_at desc);

alter table public.bridge_activation_codes enable row level security;
revoke all on table public.bridge_activation_codes from anon, authenticated;
