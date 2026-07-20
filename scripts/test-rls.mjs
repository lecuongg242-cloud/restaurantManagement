/**
 * Test cách ly RLS multi-tenant (tiêu chí P1 #5, #6, #7).
 *
 * Chạy với Supabase project DEV (không bao giờ chạy trên prod):
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:rls
 *
 * Kịch bản:
 *   - Seed 2 tenant (rls-test-a, rls-test-b) + 7 user (1 super-admin, 5 vai trò tenant A, 1 owner tenant B)
 *   - Ma trận đọc/ghi chéo tenant → kỳ vọng 0 truy cập trái phép
 *   - Luồng mời: hợp lệ / sai email / hết hạn
 *   - Khóa membership → mất truy cập tenant đó ngay, tenant khác không ảnh hưởng
 *   - Dọn sạch dữ liệu test khi xong
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Thiếu env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const PASSWORD = "Rls-Test-12345!";
const EMAILS = {
  super: "rls-super@test.local",
  aOwner: "rls-a-owner@test.local",
  aManager: "rls-a-manager@test.local",
  aCashier: "rls-a-cashier@test.local",
  aWaiter: "rls-a-waiter@test.local",
  aKitchen: "rls-a-kitchen@test.local",
  bOwner: "rls-b-owner@test.local",
  invitee: "rls-invitee@test.local",
};

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name} ${detail}`); }
}

async function ensureUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (error) {
    if (!/already/i.test(error.message)) throw error;
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    return list.users.find((u) => u.email === email).id;
  }
  return data.user.id;
}

async function signIn(email) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Đăng nhập thất bại ${email}: ${error.message}`);
  return client;
}

async function cleanup(userIds) {
  await admin.from("tenants").delete().in("slug", ["rls-test-a", "rls-test-b"]);
  for (const id of userIds) await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function main() {
  console.log("== Seed dữ liệu test ==");
  const ids = {};
  for (const [key, email] of Object.entries(EMAILS)) ids[key] = await ensureUser(email);

  // Dọn dữ liệu cũ nếu lần chạy trước bỏ dở
  await admin.from("tenants").delete().in("slug", ["rls-test-a", "rls-test-b"]);

  const { data: tA, error: eA } = await admin.from("tenants")
    .insert({ slug: "rls-test-a", name: "Tenant A" }).select().single();
  const { data: tB, error: eB } = await admin.from("tenants")
    .insert({ slug: "rls-test-b", name: "Tenant B" }).select().single();
  if (eA || eB) throw eA || eB;

  await admin.from("super_admins").upsert({ user_id: ids.super });
  const roles = [
    { tenant_id: tA.id, user_id: ids.aOwner, role: "owner" },
    { tenant_id: tA.id, user_id: ids.aManager, role: "manager" },
    { tenant_id: tA.id, user_id: ids.aCashier, role: "cashier" },
    { tenant_id: tA.id, user_id: ids.aWaiter, role: "waiter" },
    { tenant_id: tA.id, user_id: ids.aKitchen, role: "kitchen" },
    { tenant_id: tB.id, user_id: ids.bOwner, role: "owner" },
  ];
  const { error: eM } = await admin.from("memberships").upsert(roles);
  if (eM) throw eM;

  console.log("\n== 1. Ma trận cách ly tenant (5 vai trò tenant A vs tenant B) ==");
  for (const key of ["aOwner", "aManager", "aCashier", "aWaiter", "aKitchen"]) {
    const c = await signIn(EMAILS[key]);
    const { data: seesA } = await c.from("tenants").select("id").eq("id", tA.id);
    const { data: seesB } = await c.from("tenants").select("id").eq("id", tB.id);
    check(`${key}: thấy tenant A`, seesA?.length === 1);
    check(`${key}: KHÔNG thấy tenant B`, (seesB ?? []).length === 0);

    const { data: memB } = await c.from("memberships").select("*").eq("tenant_id", tB.id);
    check(`${key}: KHÔNG đọc được memberships tenant B`, (memB ?? []).length === 0);

    const { error: insB } = await c.from("memberships")
      .insert({ tenant_id: tB.id, user_id: ids[key], role: "owner" });
    check(`${key}: KHÔNG ghi được membership vào tenant B`, !!insB);

    const { error: invB } = await c.from("tenant_invitations")
      .insert({ tenant_id: tB.id, email: "x@test.local", role: "waiter", invited_by: ids[key] });
    check(`${key}: KHÔNG tạo được lời mời cho tenant B`, !!invB);

    const { error: upB } = await c.from("tenants").update({ name: "hacked" }).eq("id", tB.id);
    const { data: bAfter } = await admin.from("tenants").select("name").eq("id", tB.id).single();
    check(`${key}: KHÔNG sửa được tenant B`, !upB ? bAfter.name === "Tenant B" : true);
    await c.auth.signOut();
  }

  console.log("\n== 2. Super-admin ==");
  {
    const c = await signIn(EMAILS.super);
    const { data: all } = await c.from("tenants").select("id").in("id", [tA.id, tB.id]);
    check("super: thấy cả 2 tenant", (all ?? []).length === 2);
    const { error: insT } = await c.from("tenants")
      .insert({ slug: "rls-test-c", name: "Tenant C" });
    check("super: tạo được tenant", !insT);
    await admin.from("tenants").delete().eq("slug", "rls-test-c");
    await c.auth.signOut();
  }
  {
    const c = await signIn(EMAILS.aOwner);
    const { error } = await c.from("tenants").insert({ slug: "rls-test-d", name: "D" });
    check("owner thường: KHÔNG tạo được tenant", !!error);
    await c.auth.signOut();
  }

  console.log("\n== 3. Luồng mời (tenant_invitations) ==");
  let inviteToken;
  {
    const c = await signIn(EMAILS.aOwner);
    const { data: inv, error } = await c.from("tenant_invitations")
      .insert({ tenant_id: tA.id, email: EMAILS.invitee, role: "waiter", invited_by: ids.aOwner })
      .select().single();
    check("owner A: tạo được lời mời", !error && !!inv?.token);
    inviteToken = inv?.token;
    await c.auth.signOut();
  }
  {
    const wrong = await signIn(EMAILS.bOwner); // sai email
    const { error } = await wrong.rpc("accept_invitation", { p_token: inviteToken });
    check("sai email: KHÔNG chấp nhận được lời mời", /EMAIL_MISMATCH/.test(error?.message ?? ""));
    await wrong.auth.signOut();
  }
  {
    const invitee = await signIn(EMAILS.invitee);
    const { data: before } = await invitee.from("tenants").select("id").eq("id", tA.id);
    check("người được mời (trước khi chấp nhận): chưa thấy tenant A", (before ?? []).length === 0);
    const { data: slug, error } = await invitee.rpc("accept_invitation", { p_token: inviteToken });
    check("đúng email: chấp nhận lời mời thành công", !error && slug === "rls-test-a");
    const { error: again } = await invitee.rpc("accept_invitation", { p_token: inviteToken });
    check("lời mời đã dùng: KHÔNG dùng lại được", !!again);
    const { data: after } = await invitee.from("tenants").select("id").eq("id", tA.id);
    check("sau khi chấp nhận: thấy tenant A", (after ?? []).length === 1);
    await invitee.auth.signOut();
  }
  {
    // Lời mời hết hạn
    const { data: expired } = await admin.from("tenant_invitations")
      .insert({
        tenant_id: tA.id, email: EMAILS.invitee, role: "waiter",
        // Lùi hẳn 1 giờ để miễn nhiễm lệch đồng hồ client/DB
        invited_by: ids.aOwner, expires_at: new Date(Date.now() - 3600_000).toISOString(),
      }).select().single();
    const invitee = await signIn(EMAILS.invitee);
    const { error } = await invitee.rpc("accept_invitation", { p_token: expired.token });
    check("lời mời hết hạn: bị từ chối", /EXPIRED/.test(error?.message ?? ""));
    await invitee.auth.signOut();
  }

  console.log("\n== 4. Khóa nhân viên (2 tầng, đúng tenant) ==");
  {
    const c = await signIn(EMAILS.aWaiter);
    const { data: before } = await c.from("tenants").select("id").eq("id", tA.id);
    check("waiter A (trước khi khóa): thấy tenant A", (before ?? []).length === 1);

    await admin.from("memberships")
      .update({ status: "disabled" })
      .match({ tenant_id: tA.id, user_id: ids.aWaiter });

    // Session cũ vẫn còn — RLS phải chặn ngay request kế tiếp
    const { data: after } = await c.from("tenants").select("id").eq("id", tA.id);
    check("waiter A (sau khi khóa, session cũ): RLS trả 0 dòng", (after ?? []).length === 0);

    // Membership tenant khác của cùng user không bị ảnh hưởng:
    await admin.from("memberships").upsert({ tenant_id: tB.id, user_id: ids.aWaiter, role: "waiter" });
    const { data: seesB } = await c.from("tenants").select("id").eq("id", tB.id);
    check("cùng user, tenant B vẫn active: thấy tenant B", (seesB ?? []).length === 1);
    await c.auth.signOut();
  }

  console.log("\n== Dọn dữ liệu test ==");
  await cleanup(Object.values(ids));

  console.log(`\nKẾT QUẢ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("Tiêu chí FAIL:", failures.join("; "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Lỗi chạy test:", e);
  process.exit(1);
});
