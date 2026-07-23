-- seed.sql — 2 tenant demo cho test RLS + trang data-scope (P1 / plan 01-04).
-- Chạy: local `supabase db reset` (tự nạp seed), CI, hoặc `npm run seed` (script Node
-- dùng Admin API — cùng dữ liệu). Idempotent qua ON CONFLICT + UUID cố định.
--
-- Owner đăng nhập test (anon signInWithPassword):
--   Super    : super@demo.test    / SuperPass123!  (vào /super)
--   Phở Việt : ownerA@pho-viet.test / DemoPass123!
--   Bún Bò   : ownerB@bun-bo.test  / DemoPass123!

-- ---- Auth users (super + owner A & B) ---------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated',
   'super@demo.test', crypt('SuperPass123!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Super Admin"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated',
   'ownerA@pho-viet.test', crypt('DemoPass123!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner Phở Việt"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated',
   'ownerB@bun-bo.test', crypt('DemoPass123!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Owner Bún Bò"}',
   '', '', '', '')
on conflict (id) do nothing;

-- ---- Auth identities (bắt buộc cho login email) -----------------------------
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","email":"super@demo.test","email_verified":true}',
   'email', now(), now(), now()),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"ownerA@pho-viet.test","email_verified":true}',
   'email', now(), now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"ownerB@bun-bo.test","email_verified":true}',
   'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- ---- Profiles ---------------------------------------------------------------
insert into public.profiles (id, full_name) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Super Admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner Phở Việt'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Owner Bún Bò')
on conflict (id) do nothing;

-- ---- Super-admin ------------------------------------------------------------
insert into public.super_admins (user_id) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc')
on conflict (user_id) do nothing;

-- ---- Tenants ----------------------------------------------------------------
insert into public.tenants (id, slug, name) values
  ('11111111-1111-1111-1111-111111111111', 'pho-viet', 'Phở Việt'),
  ('22222222-2222-2222-2222-222222222222', 'bun-bo',   'Bún Bò Huế')
on conflict (id) do nothing;

-- ---- Memberships: owner mỗi tenant -----------------------------------------
insert into public.memberships (id, tenant_id, user_id, role, display_name, active) values
  ('a1111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'owner', 'Owner Phở Việt', true),
  ('b2222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'owner', 'Owner Bún Bò', true)
on conflict (id) do nothing;

-- ---- Nhân viên demo (dùng cho test đọc chéo RLS) ---------------------------
-- LƯU Ý (QD-009): tài khoản đăng nhập của nhân viên (email + mật khẩu SUY DẪN từ PIN bằng pepper)
-- được tạo qua `npm run seed` (Admin API, cần STAFF_PIN_PEPPER) — SQL thuần không suy dẫn được.
-- Dòng dưới chỉ giữ membership + email tham chiếu (user_id NULL) để RLS test có dữ liệu.
insert into public.memberships (id, tenant_id, user_id, role, display_name, email, pin_hash, active) values
  ('a1111111-1111-1111-1111-111111111112',
   '11111111-1111-1111-1111-111111111111', null, 'cashier', 'Lan (Phở Việt)', 'lan@pho-viet.test',
   crypt('1234', gen_salt('bf')), true),
  ('b2222222-2222-2222-2222-222222222223',
   '22222222-2222-2222-2222-222222222222', null, 'kitchen', 'Hùng (Bún Bò)', 'hung@bun-bo.test',
   crypt('5678', gen_salt('bf')), true)
on conflict (id) do nothing;
