import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";
import { CASES, targetIdOfB } from "./matrix-cases";
import { homNayHanDung } from "@/lib/tenant/subscription";

/**
 * P15 15-06 (BRANCH-07) + 15-07 (BRANCH-08) — hai quán demo gộp tạm thành MỘT thương hiệu hai chi nhánh:
 * B1 = pho-viet (fixture A), B2 = bun-bo (fixture B). Chủ hai quán thành chủ thương hiệu (vào được cả hai).
 *
 *  - Thu ngân B1 KHÔNG đọc được B2 (0 dòng) và không ghi được vào B2 ở MỌI bảng của ma trận TENANT-05.
 *  - Chủ thương hiệu đọc được cả B1 và B2.
 *  - Gia hạn chuỗi: một lần ghi nhận → mọi chi nhánh đang hoạt động cùng một ngày; chi nhánh tạm ngưng không đụng.
 *
 * afterAll trả nguyên trạng: trả `brand_id` cũ, xóa thương hiệu thử, XÓA membership chéo do đồng bộ thêm (chủ A ở B,
 * chủ B ở A), trả `paid_until`/`status` cũ, xóa tài khoản tạm và dòng nhật ký thử.
 *
 * Quán demo đang thuộc một thương hiệu khác (vd thương hiệu thử của chủ dự án) → TẠM gỡ ra (chỉ cột `brand_id`, không
 * đụng thương hiệu đó hay membership của nó) rồi gắn lại ở afterAll — trước đây test tự dừng trong trường hợp này.
 */
const TAG = crypto.randomUUID().slice(0, 6);
let tenantA = "";
let tenantB = "";
let brandId = "";
let ownerAId = "";
let ownerBId = "";
const tam: string[] = [];
let superAdmin: SupabaseClient;
let cashierA: SupabaseClient;
let chuoi: SupabaseClient;
let goc: { id: string; paid_until: string | null; status: string; brand_id: string | null }[] = [];

let daDung = false;

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
  const admin = adminClient();
  goc = ((await admin.from("tenants").select("id, paid_until, status, brand_id").in("id", [tenantA, tenantB])).data ?? []) as typeof goc;
  if (goc.length !== 2) throw new Error("Không đọc được hai quán demo.");
  daDung = true;
  for (const t of goc) if (t.brand_id) await admin.from("tenants").update({ brand_id: null }).eq("id", t.id);

  const tao = async (nhan: string) => {
    const email = `p15-iso-${nhan}-${TAG}@test.local`;
    const password = crypto.randomBytes(18).toString("base64url");
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    tam.push(data.user!.id);
    return { id: data.user!.id, email, password };
  };
  const su = await tao("su");
  await admin.from("super_admins").insert({ user_id: su.id });
  superAdmin = await signInAs(su.email, su.password);
  const c = await tao("cashier");
  await admin.from("memberships").insert({ tenant_id: tenantA, user_id: c.id, role: "cashier", display_name: "P15", active: true });
  cashierA = await signInAs(c.email, c.password);

  const { data: id } = await superAdmin.rpc("create_brand", { p_name: "P15 Iso", p_slug: `p15-iso-${TAG}` });
  brandId = id as string;
  expect((await superAdmin.rpc("attach_tenant_to_brand", { p_tenant: tenantA, p_brand: brandId })).error).toBeNull();
  expect((await superAdmin.rpc("attach_tenant_to_brand", { p_tenant: tenantB, p_brand: brandId })).error).toBeNull();

  chuoi = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerAId = (await chuoi.auth.getUser()).data.user!.id;
  ownerBId = (await (await signInAs(OWNER_B.email, OWNER_B.password)).auth.getUser()).data.user!.id;
}, 120_000);

afterAll(async () => {
  if (!daDung) return;
  const admin = adminClient();
  for (const t of goc) await admin.from("tenants").update({ brand_id: t.brand_id, paid_until: t.paid_until, status: t.status }).eq("id", t.id);
  await admin.from("subscription_payments").delete().eq("brand_id", brandId);
  if (brandId) await admin.from("brands").delete().eq("id", brandId);
  // Membership chéo do sync_brand_memberships thêm — quán demo trở lại cách ly như trước.
  await admin.from("memberships").delete().eq("tenant_id", tenantB).eq("user_id", ownerAId);
  await admin.from("memberships").delete().eq("tenant_id", tenantA).eq("user_id", ownerBId);
  await admin.from("memberships").delete().in("user_id", tam);
  await admin.from("super_admins").delete().in("user_id", tam);
  for (const id of tam) await admin.auth.admin.deleteUser(id);
  await cleanupFixtures();
}, 120_000);

describe("cách ly giữa chi nhánh cùng thương hiệu (ma trận TENANT-05)", () => {
  it.each(CASES)("$table — thu ngân B1 đọc B2 = 0 dòng; chủ thương hiệu đọc được cả hai", async (c) => {
    const col = c.selectColumn ?? "id";
    const { data: cheo } = await cashierA.from(c.table).select(col).eq("tenant_id", tenantB);
    expect(cheo ?? [], `${c.table}: thu ngân B1 đọc được B2`).toHaveLength(0);
    for (const t of [tenantA, tenantB]) {
      const { data } = await chuoi.from(c.table).select(col).eq("tenant_id", t);
      expect((data ?? []).length, `${c.table}: chủ thương hiệu không đọc được ${t === tenantA ? "B1" : "B2"}`).toBeGreaterThan(0);
    }
  }, 60_000);

  it.each(CASES)("$table — thu ngân B1 chèn dòng mang tenant_id B2 → bị chặn; sửa dòng B2 → không đổi", async (c) => {
    const { error } = await cashierA.from(c.table).insert(c.insertRow(tenantB, crypto.randomUUID()));
    expect(error, `${c.table}: thu ngân B1 chèn được vào B2`).not.toBeNull();
    const idCol = c.idColumn ?? "id";
    await cashierA.from(c.table).update(c.updatePatch).eq(idCol, targetIdOfB(c)).eq("tenant_id", tenantB);
    const key = Object.keys(c.updatePatch)[0];
    const { data } = await adminClient().from(c.table).select(key).eq(idCol, targetIdOfB(c)).eq("tenant_id", tenantB).limit(1);
    expect((data?.[0] as Record<string, unknown> | undefined)?.[key]).not.toBe(c.updatePatch[key]);
  }, 60_000);
});

describe("gia hạn theo thương hiệu (15-07)", () => {
  const cach = (n: number) => {
    const t = homNayHanDung();
    return new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10) + n)).toISOString().slice(0, 10);
  };

  it("chủ thương hiệu gọi RPC ghi nhận → bị từ chối", async () => {
    const { error } = await chuoi.rpc("record_brand_subscription_payment", { p_brand: brandId, p_months: 1, p_amount: 1 });
    expect(error?.code).toBe("42501");
  }, 60_000);

  it("hai chi nhánh hạn khác nhau → một lần ghi nhận → cùng ngày = max(hôm nay, hạn muộn nhất) + 1 tháng; một dòng nhật ký", async () => {
    await adminClient().from("tenants").update({ paid_until: cach(5) }).eq("id", tenantA);
    await adminClient().from("tenants").update({ paid_until: cach(20) }).eq("id", tenantB);
    const { data, error } = await superAdmin.rpc("record_brand_subscription_payment", {
      p_brand: brandId, p_months: 1, p_amount: 700_000, p_note: `TEST ${TAG}`,
    });
    expect(error).toBeNull();
    const { data: t } = await adminClient().from("tenants").select("paid_until").in("id", [tenantA, tenantB]);
    const ngay = new Set((t ?? []).map((r) => r.paid_until));
    expect(ngay.size).toBe(1);
    expect(data).toMatchObject({ brand_id: brandId, months: 1, amount: 700_000, paid_until_before: cach(20), paid_until_after: [...ngay][0] });
    const { count } = await adminClient().from("subscription_payments").select("id", { count: "exact", head: true }).eq("brand_id", brandId);
    expect(count).toBe(1);
  }, 60_000);

  it("chi nhánh tạm ngưng không bị gia hạn; lỗi giữa chừng không đổi gì", async () => {
    await adminClient().from("tenants").update({ status: "suspended", paid_until: cach(2) }).eq("id", tenantB);
    await superAdmin.rpc("record_brand_subscription_payment", { p_brand: brandId, p_months: 1, p_amount: 0 });
    expect((await adminClient().from("tenants").select("paid_until").eq("id", tenantB).single()).data?.paid_until).toBe(cach(2));
    await adminClient().from("tenants").update({ status: "active" }).eq("id", tenantB);

    const truoc = (await adminClient().from("tenants").select("id, paid_until").in("id", [tenantA, tenantB])).data;
    const { error } = await superAdmin.rpc("record_brand_subscription_payment", { p_brand: brandId, p_months: 1, p_amount: 0, p_note: "x".repeat(600) });
    expect(error).not.toBeNull();
    expect((await adminClient().from("tenants").select("id, paid_until").in("id", [tenantA, tenantB])).data).toEqual(truoc);
  }, 60_000);

  it("có chi nhánh không giới hạn → mặc định từ chối (bảo vệ quán như qt-food)", async () => {
    await adminClient().from("tenants").update({ paid_until: null }).eq("id", tenantA);
    const { error } = await superAdmin.rpc("record_brand_subscription_payment", { p_brand: brandId, p_months: 1, p_amount: 0 });
    expect(error).not.toBeNull();
    expect((await adminClient().from("tenants").select("paid_until").eq("id", tenantA).single()).data?.paid_until).toBeNull();
  }, 60_000);

  it("chi nhánh mới tạo giữa kỳ → nhận hạn chung", async () => {
    await adminClient().from("tenants").update({ paid_until: cach(40) }).in("id", [tenantA, tenantB]);
    const { data: nid, error } = await superAdmin.rpc("create_branch", { p_brand: brandId, p_name: "CN3", p_slug: `p15-iso-cn3-${TAG}` });
    expect(error).toBeNull();
    const { data: t } = await adminClient().from("tenants").select("paid_until").eq("id", nid).single();
    expect(t?.paid_until).toBe(cach(40));
    await adminClient().from("tenants").delete().eq("id", nid);
  }, 60_000);

  it("RLS nhật ký: chủ thương hiệu đọc dòng của chuỗi; thu ngân = 0 dòng", async () => {
    expect(((await chuoi.from("subscription_payments").select("id").eq("brand_id", brandId)).data ?? []).length).toBeGreaterThan(0);
    expect((await cashierA.from("subscription_payments").select("id")).data ?? []).toHaveLength(0);
  }, 60_000);

  it("đổi chi nhánh gốc: chủ thương hiệu được; chi nhánh ngoài thương hiệu → lỗi", async () => {
    expect((await chuoi.rpc("set_brand_root", { p_brand: brandId, p_tenant: tenantB })).error).toBeNull();
    expect((await adminClient().from("brands").select("root_tenant_id").eq("id", brandId).single()).data?.root_tenant_id).toBe(tenantB);
    const { data: qt } = await adminClient().from("tenants").select("id").eq("slug", "qt-food").single();
    expect((await chuoi.rpc("set_brand_root", { p_brand: brandId, p_tenant: qt!.id })).error).not.toBeNull();
    expect((await cashierA.rpc("set_brand_root", { p_brand: brandId, p_tenant: tenantA })).error?.code).toBe("42501");
  }, 60_000);
});
