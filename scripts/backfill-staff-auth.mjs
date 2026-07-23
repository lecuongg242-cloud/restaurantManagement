// scripts/backfill-staff-auth.mjs — Cấp tài khoản Supabase cho nhân viên PIN-only cũ (QD-009).
//
// Nhân viên cũ có user_id NULL + pin_hash (PIN cũ băm bcrypt một chiều — KHÔNG khôi phục được).
// Script này: sinh email <ten>@<slug>.staff.local, tạo auth user với mật khẩu suy dẫn từ PIN TẠM
// (mặc định 1234), rồi gắn user_id + email + pin_hash mới. Owner đổi lại PIN/email sau ở /admin/staff.
// Idempotent: bỏ qua nhân viên đã có user_id. Chạy: `node scripts/backfill-staff-auth.mjs`.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pepper = process.env.STAFF_PIN_PEPPER;
if (!url || !serviceKey || !pepper) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STAFF_PIN_PEPPER trong .env.local");
  process.exit(1);
}

const DEFAULT_PIN = process.env.BACKFILL_DEFAULT_PIN || "1234";
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function derivePinPassword(email, pin) {
  const mac = crypto.createHmac("sha256", pepper).update(`${email.trim().toLowerCase()}:${pin}`).digest("hex");
  return `pin_${mac}`;
}

/** Bỏ dấu tiếng Việt + ký tự lạ → chuỗi slug cho phần đầu email. */
function slugName(name) {
  const s = (name || "nv")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return s || "nv";
}

async function emailTaken(email) {
  const { data } = await admin.from("memberships").select("id").eq("email", email).maybeSingle();
  return !!data;
}

async function ensureUser(email, password, name) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (!error && data?.user) return data.user.id;
  // Đã tồn tại → tìm và đặt lại mật khẩu cho khớp PIN tạm.
  let page = 1;
  for (;;) {
    const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (lErr) throw lErr;
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      await admin.auth.admin.updateUserById(found.id, { password });
      return found.id;
    }
    if (list.users.length < 200) break;
    page += 1;
  }
  throw error ?? new Error(`Không tạo/tìm được user ${email}`);
}

async function main() {
  const { data: rows, error } = await admin
    .from("memberships")
    .select("id, role, display_name, email, user_id, tenant_id, tenants(slug)")
    .in("role", ["cashier", "waiter", "kitchen"])
    .is("user_id", null);
  if (error) throw error;

  if (!rows?.length) {
    console.log("Không có nhân viên nào cần backfill.");
    return;
  }

  const results = [];
  for (const m of rows) {
    const slug = m.tenants?.slug ?? "staff";
    let email = m.email;
    if (!email) {
      email = `${slugName(m.display_name)}@${slug}.staff.local`;
      let n = 2;
      while (await emailTaken(email)) {
        email = `${slugName(m.display_name)}.${n}@${slug}.staff.local`;
        n += 1;
      }
    }

    const userId = await ensureUser(email, derivePinPassword(email, DEFAULT_PIN), m.display_name ?? "Nhân viên");
    const pin_hash = await bcrypt.hash(DEFAULT_PIN, 10);
    const { error: uErr } = await admin
      .from("memberships")
      .update({ user_id: userId, email, pin_hash })
      .eq("id", m.id);
    if (uErr) throw uErr;

    results.push({ tenant: slug, name: m.display_name, role: m.role, email, pin: DEFAULT_PIN });
  }

  console.log(`✓ Backfill ${results.length} nhân viên. Đăng nhập tại /r/<slug>/pos|kds/login:`);
  console.table(results);
  console.log("→ Nhắc owner đổi PIN/email từng người ở /admin/staff.");
}

main().catch((e) => {
  console.error("Backfill lỗi:", e.message ?? e);
  process.exit(1);
});
