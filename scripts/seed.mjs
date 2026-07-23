// scripts/seed.mjs — Seed 2 tenant demo qua Admin API (đáng tin trên project remote).
// Cùng dữ liệu với supabase/seed.sql. Idempotent. Chạy: `npm run seed`.
//
// Cần env (đọc từ .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pepper = process.env.STAFF_PIN_PEPPER;
if (!url || !serviceKey) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  process.exit(1);
}
if (!pepper) {
  console.error("Thiếu STAFF_PIN_PEPPER trong .env.local (QD-009).");
  process.exit(1);
}

/** Suy dẫn mật khẩu Supabase từ PIN — KHỚP lib/auth/staff-credentials.ts (email+':'+pin, HMAC). */
function derivePinPassword(email, pin) {
  const mac = crypto.createHmac("sha256", pepper).update(`${email.trim().toLowerCase()}:${pin}`).digest("hex");
  return `pin_${mac}`;
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TENANTS = [
  {
    slug: "pho-viet",
    name: "Phở Việt",
    owner: { email: "ownerA@pho-viet.test", password: "DemoPass123!", name: "Owner Phở Việt" },
    station: { email: "station@pho-viet.test", password: "StationPass123!", name: "Trạm Phở Việt" },
    staff: [
      { role: "cashier", name: "Lan", email: "lan@pho-viet.test", pin: "1234" },
      { role: "kitchen", name: "Hùng", email: "hung@pho-viet.test", pin: "5678" },
    ],
  },
  {
    slug: "bun-bo",
    name: "Bún Bò Huế",
    owner: { email: "ownerB@bun-bo.test", password: "DemoPass123!", name: "Owner Bún Bò" },
    station: { email: "station@bun-bo.test", password: "StationPass123!", name: "Trạm Bún Bò" },
    staff: [{ role: "waiter", name: "Mai", email: "mai@bun-bo.test", pin: "4321" }],
  },
];

/** Tạo user (hoặc lấy user đã tồn tại theo email). Trả userId. */
async function ensureUser({ email, password, name }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (!error && data?.user) return data.user.id;

  // Đã tồn tại → tìm bằng cách duyệt (project demo ít user).
  let page = 1;
  for (;;) {
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (lErr) throw lErr;
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (list.users.length < 200) break;
    page += 1;
  }
  throw error ?? new Error(`Không tạo/tìm được user ${email}`);
}

async function ensureTenant(slug, name) {
  const { data: existing } = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin
    .from("tenants")
    .insert({ slug, name })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureMembership(row) {
  // Khớp theo (tenant_id, user_id) cho tài khoản; theo (tenant_id, display_name, role) cho PIN-only.
  const q = admin.from("memberships").select("id").eq("tenant_id", row.tenant_id).eq("role", row.role);
  const { data } = row.user_id
    ? await q.eq("user_id", row.user_id).maybeSingle()
    : await q.is("user_id", null).eq("display_name", row.display_name).maybeSingle();
  if (data) return data.id;
  const { data: ins, error } = await admin.from("memberships").insert(row).select("id").single();
  if (error) throw error;
  return ins.id;
}

const SUPER_ADMIN = { email: "super@demo.test", password: "SuperPass123!", name: "Super Admin" };

async function main() {
  // Super-admin demo (dùng cho /super). user_setup 01-02.
  const superId = await ensureUser(SUPER_ADMIN);
  await admin.from("profiles").upsert({ id: superId, full_name: SUPER_ADMIN.name });
  await admin.from("super_admins").upsert({ user_id: superId });
  console.log(`✓ Super-admin ${SUPER_ADMIN.email}`);

  for (const t of TENANTS) {
    const tenantId = await ensureTenant(t.slug, t.name);

    // Owner
    const ownerId = await ensureUser(t.owner);
    await admin.from("profiles").upsert({ id: ownerId, full_name: t.owner.name });
    await ensureMembership({
      tenant_id: tenantId,
      user_id: ownerId,
      role: "owner",
      display_name: t.owner.name,
      active: true,
    });

    // Station (đăng nhập thiết bị POS/KDS)
    const stationId = await ensureUser(t.station);
    await admin.from("profiles").upsert({ id: stationId, full_name: t.station.name });
    await ensureMembership({
      tenant_id: tenantId,
      user_id: stationId,
      role: "station",
      display_name: t.station.name,
      active: true,
    });

    // Nhân viên: tài khoản Supabase riêng (email + PIN) — đăng nhập thẳng POS/KDS (QD-009).
    for (const s of t.staff) {
      const staffUserId = await ensureUser({
        email: s.email,
        password: derivePinPassword(s.email, s.pin),
        name: s.name,
      });
      await admin.from("profiles").upsert({ id: staffUserId, full_name: s.name });
      await ensureMembership({
        tenant_id: tenantId,
        user_id: staffUserId,
        role: s.role,
        display_name: s.name,
        email: s.email,
        pin_hash: await bcrypt.hash(s.pin, 10),
        active: true,
      });
    }

    console.log(`✓ ${t.name} (${t.slug}) — owner ${t.owner.email}, station ${t.station.email}`);
  }
  console.log("Seed xong.");
}

main().catch((e) => {
  console.error("Seed lỗi:", e.message ?? e);
  process.exit(1);
});
