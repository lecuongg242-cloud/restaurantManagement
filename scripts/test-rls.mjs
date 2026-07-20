/**
 * Test cách ly RLS multi-tenant (P1 #5, #6, #7 + P2 #2, #8, #9, #10).
 *
 * Chạy với Supabase project DEV (không bao giờ chạy trên prod):
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:rls
 *
 * Kịch bản:
 *   - Seed 2 tenant (rls-test-a, rls-test-b) + 7 user (1 super-admin, 5 vai trò tenant A, 1 owner tenant B)
 *   - Ma trận đọc/ghi chéo tenant → kỳ vọng 0 truy cập trái phép
 *   - Luồng mời: hợp lệ / sai email / hết hạn
 *   - Khóa membership → mất truy cập tenant đó ngay, tenant khác không ảnh hưởng
 *   - P2: RLS 6 bảng menu/bàn; anon chỉ đọc active, KHÔNG select tables/areas,
 *     resolve QR qua RPC (1/0/0 dòng); composite FK chặn liên kết chéo tenant;
 *     CHECK giá >= 0; bucket menu-images chặn 3MB/sai MIME tại cấu hình
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

  // ===================================================================
  // P2 — chỉ chạy khi migration 0002 đã áp lên DB này
  // ===================================================================
  let p2Skipped = false;
  const { error: schemaErr } = await admin.from("menu_categories").select("id").limit(1);
  if (schemaErr) {
    p2Skipped = true;
    console.log("\n⚠ BỎ QUA các mục P2 (5–7): schema 0002 chưa áp lên DB này.");
    console.log("  → Chạy `supabase db push` rồi chạy lại test.");
  } else {
    console.log("\n== 5. P2: RLS menu & bàn ==");
    const anonC = createClient(URL, ANON, { auth: { persistSession: false } });

    // Seed qua đường người dùng thật — kiểm luôn quyền ghi của owner
    const ownerC = await signIn(EMAILS.aOwner);
    const { data: catA, error: catErr } = await ownerC.from("menu_categories")
      .insert({ tenant_id: tA.id, name: "Món chính" }).select().single();
    check("owner A: tạo được danh mục", !catErr, catErr?.message);
    const { data: itemActive } = await ownerC.from("menu_items")
      .insert({ tenant_id: tA.id, category_id: catA.id, name: "Phở bò", price: 45000 })
      .select().single();
    const { data: itemHidden } = await ownerC.from("menu_items")
      .insert({ tenant_id: tA.id, category_id: catA.id, name: "Món ẩn", price: 10000, is_active: false })
      .select().single();
    const { data: itemSoldOut } = await ownerC.from("menu_items")
      .insert({ tenant_id: tA.id, category_id: catA.id, name: "Món hết", price: 20000, is_sold_out: true })
      .select().single();
    const { data: groupA } = await ownerC.from("menu_option_groups")
      .insert({ tenant_id: tA.id, item_id: itemActive.id, name: "Size" }).select().single();
    const { data: optA } = await ownerC.from("menu_options")
      .insert({ tenant_id: tA.id, group_id: groupA.id, name: "L", price_delta: 5000 }).select().single();
    const { data: areaA } = await ownerC.from("areas")
      .insert({ tenant_id: tA.id, name: "Tầng 1" }).select().single();
    const { data: tableA } = await ownerC.from("tables")
      .insert({ tenant_id: tA.id, area_id: areaA.id, name: "1" }).select().single();
    check("owner A: tạo được món/tùy chọn/khu vực/bàn",
      !!itemActive && !!itemHidden && !!itemSoldOut && !!groupA && !!optA && !!areaA && !!tableA);
    await ownerC.auth.signOut();

    // Nhân viên không phải owner/manager: đọc được, KHÔNG ghi được
    const cashierC = await signIn(EMAILS.aCashier);
    const { data: staffSees } = await cashierC.from("menu_items")
      .select("id").eq("tenant_id", tA.id);
    check("cashier A: đọc được cả món ẩn (staff)", (staffSees ?? []).length === 3);
    const { error: cashierIns } = await cashierC.from("menu_items")
      .insert({ tenant_id: tA.id, category_id: catA.id, name: "x", price: 1 });
    check("cashier A: KHÔNG thêm được món (chỉ owner/manager)", !!cashierIns);
    await cashierC.auth.signOut();

    // Chéo tenant (bOwner với dữ liệu tenant A)
    const bC = await signIn(EMAILS.bOwner);
    const { data: bHidden } = await bC.from("menu_items").select("id").eq("id", itemHidden.id);
    check("owner B: KHÔNG thấy món ẩn của tenant A", (bHidden ?? []).length === 0);
    await bC.from("menu_items").update({ price: 1 }).eq("id", itemActive.id);
    const { data: priceAfter } = await admin.from("menu_items")
      .select("price").eq("id", itemActive.id).single();
    check("owner B: KHÔNG sửa được món của tenant A", priceAfter.price === 45000);
    await bC.from("tables").delete().eq("id", tableA.id);
    const { data: tblStill } = await admin.from("tables").select("id").eq("id", tableA.id);
    check("owner B: KHÔNG xóa được bàn của tenant A", (tblStill ?? []).length === 1);
    const { data: bTables } = await bC.from("tables").select("id").eq("tenant_id", tA.id);
    check("owner B: KHÔNG đọc được bàn của tenant A", (bTables ?? []).length === 0);
    await bC.auth.signOut();

    console.log("\n== 6. P2: Anon — menu công khai, KHÔNG lộ bàn/khu vực, RPC resolve QR ==");
    const { data: anonItems } = await anonC.from("menu_items")
      .select("id").eq("tenant_id", tA.id);
    check("anon: thấy đúng 2 món active (gồm món hết — để realtime)", (anonItems ?? []).length === 2);
    check("anon: KHÔNG thấy món ẩn", !(anonItems ?? []).some((i) => i.id === itemHidden.id));
    const { error: anonIns } = await anonC.from("menu_items")
      .insert({ tenant_id: tA.id, category_id: catA.id, name: "x", price: 1 });
    check("anon: KHÔNG thêm được món", !!anonIns);
    await anonC.from("menu_items").update({ price: 1 }).eq("id", itemActive.id);
    const { data: priceAfterAnon } = await admin.from("menu_items")
      .select("price").eq("id", itemActive.id).single();
    check("anon: KHÔNG sửa được món", priceAfterAnon.price === 45000);

    const { data: anonTables } = await anonC.from("tables").select("id");
    check("anon: SELECT trực tiếp tables → 0 dòng (cam kết #8)", (anonTables ?? []).length === 0);
    const { data: anonAreas } = await anonC.from("areas").select("id");
    check("anon: SELECT trực tiếp areas → 0 dòng (cam kết #8)", (anonAreas ?? []).length === 0);
    const { data: anonTenants } = await anonC.from("tenants").select("id");
    check("anon: SELECT trực tiếp tenants → 0 dòng (RLS P1 giữ nguyên)", (anonTenants ?? []).length === 0);
    const { data: pubInfo } = await anonC.from("tenant_public_info")
      .select("slug, name").eq("slug", "rls-test-a");
    check("anon: đọc được tenant_public_info (view công khai)", (pubInfo ?? []).length === 1);

    const { data: rpcOk } = await anonC.rpc("resolve_table_by_qr", { p_qr_token: tableA.qr_token });
    check("anon RPC token đúng → đúng 1 dòng, đúng bàn/khu vực/slug",
      (rpcOk ?? []).length === 1 && rpcOk[0].table_name === "1"
      && rpcOk[0].area_name === "Tầng 1" && rpcOk[0].tenant_slug === "rls-test-a");
    const { data: rpcBad } = await anonC.rpc("resolve_table_by_qr", { p_qr_token: crypto.randomUUID() });
    check("anon RPC token sai → 0 dòng", (rpcBad ?? []).length === 0);

    const { data: anonGroups } = await anonC.from("menu_option_groups")
      .select("id").eq("item_id", itemActive.id);
    check("anon: thấy nhóm tùy chọn của món active", (anonGroups ?? []).length === 1);
    await admin.from("menu_items").update({ is_active: false }).eq("id", itemActive.id);
    const { data: anonGroups2 } = await anonC.from("menu_option_groups")
      .select("id").eq("item_id", itemActive.id);
    check("anon: món bị ẨN → nhóm tùy chọn biến mất theo", (anonGroups2 ?? []).length === 0);
    await admin.from("menu_items").update({ is_active: true }).eq("id", itemActive.id);

    await admin.from("tables").delete().eq("id", tableA.id);
    const { data: rpcDeleted } = await anonC.rpc("resolve_table_by_qr", { p_qr_token: tableA.qr_token });
    check("bàn đã xóa → RPC 0 dòng (trang 'QR không còn hiệu lực')", (rpcDeleted ?? []).length === 0);

    console.log("\n== 7. P2: Ràng buộc DATABASE — composite FK + CHECK (service-role, lách RLS) ==");
    const { error: fk1 } = await admin.from("menu_items")
      .insert({ tenant_id: tB.id, category_id: catA.id, name: "x", price: 1 });
    check("composite FK: món tenant B ↛ danh mục tenant A", !!fk1);
    const { error: fk2 } = await admin.from("menu_option_groups")
      .insert({ tenant_id: tB.id, item_id: itemActive.id, name: "x" });
    check("composite FK: nhóm tùy chọn tenant B ↛ món tenant A", !!fk2);
    const { error: fk3 } = await admin.from("menu_options")
      .insert({ tenant_id: tB.id, group_id: groupA.id, name: "x" });
    check("composite FK: lựa chọn tenant B ↛ nhóm tenant A", !!fk3);
    const { error: fk4 } = await admin.from("tables")
      .insert({ tenant_id: tB.id, area_id: areaA.id, name: "x" });
    check("composite FK: bàn tenant B ↛ khu vực tenant A", !!fk4);
    const { error: ck1 } = await admin.from("menu_items")
      .insert({ tenant_id: tA.id, category_id: catA.id, name: "x", price: -1 });
    check("CHECK: giá món âm bị từ chối", !!ck1);
    const { error: ck2 } = await admin.from("menu_options")
      .insert({ tenant_id: tA.id, group_id: groupA.id, name: "x", price_delta: -100 });
    check("CHECK: phụ thu âm bị từ chối", !!ck2);

    console.log("\n== 8. P2: Storage bucket menu-images (chặn tại CẤU HÌNH bucket) ==");
    const bigFile = Buffer.alloc(3 * 1024 * 1024, 1);   // 3MB > file_size_limit 2MB
    const smallFile = Buffer.alloc(1024, 1);
    const ownerC2 = await signIn(EMAILS.aOwner);
    const upBig = await ownerC2.storage.from("menu-images")
      .upload(`${tA.id}/rls-big.jpg`, bigFile, { contentType: "image/jpeg", upsert: true });
    check("bucket: file 3MB (qua API, bỏ qua client) bị TỪ CHỐI", !!upBig.error);
    const upGif = await ownerC2.storage.from("menu-images")
      .upload(`${tA.id}/rls-test.gif`, smallFile, { contentType: "image/gif", upsert: true });
    check("bucket: MIME image/gif bị TỪ CHỐI", !!upGif.error);
    const upOk = await ownerC2.storage.from("menu-images")
      .upload(`${tA.id}/rls-test.webp`, smallFile, { contentType: "image/webp", upsert: true });
    check("bucket: owner A upload webp ≤ 2MB vào thư mục tenant mình → OK",
      !upOk.error, upOk.error?.message);
    await ownerC2.auth.signOut();
    const bC2 = await signIn(EMAILS.bOwner);
    const upCross = await bC2.storage.from("menu-images")
      .upload(`${tA.id}/rls-hack.webp`, smallFile, { contentType: "image/webp", upsert: true });
    check("storage policy: owner B KHÔNG ghi được vào thư mục tenant A", !!upCross.error);
    await bC2.auth.signOut();
    const upAnon = await anonC.storage.from("menu-images")
      .upload(`${tA.id}/rls-anon.webp`, smallFile, { contentType: "image/webp" });
    check("storage policy: anon KHÔNG upload được", !!upAnon.error);
    await admin.storage.from("menu-images").remove([`${tA.id}/rls-test.webp`]);
  }

  console.log("\n== Dọn dữ liệu test ==");
  await cleanup(Object.values(ids));

  if (p2Skipped) {
    console.log(`\nKẾT QUẢ P1: ${pass} PASS / ${fail} FAIL — các mục P2 CHƯA CHẠY (thiếu migration 0002).`);
    process.exit(fail > 0 ? 1 : 4); // exit 4: chưa đủ điều kiện nghiệm thu P2
  }

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
