import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient } from "./fixtures";
import { homNayHanDung } from "@/lib/tenant/subscription";
import { provisionOwner } from "@/lib/tenant/provision-owner";

/**
 * P15 15-01 (BRANCH-01, BRANCH-02) — thương hiệu, chi nhánh = tenant, một tài khoản chủ (0062).
 *
 * DB dùng chung với quán thật ⇒ chỉ đụng quán demo `bun-bo` (gắn tạm vào thương hiệu thử) và tenant tạm do
 * test tạo; afterAll gỡ sạch: xóa chi nhánh tạm, bỏ brand_id của bun-bo, xóa thương hiệu, xóa tài khoản tạm.
 */
const TAG = crypto.randomUUID().slice(0, 6);
const BRAND_SLUG = `p15-test-${TAG}`;
const BRANCH_SLUG = `p15-cn2-${TAG}`;

type Tam = { id: string; email: string; password: string };
const tam: Tam[] = [];
let tenantB = "";
let brandId = "";
let superAdmin: SupabaseClient;
let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let managerB: SupabaseClient;
let cashierB: SupabaseClient;
let manager: Tam;

async function taoTaiKhoan(nhan: string): Promise<Tam> {
  const email = `p15-${nhan}-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("không tạo được user tạm");
  const t = { id: data.user.id, email, password };
  tam.push(t);
  return t;
}

let daDung = false;

beforeAll(async () => {
  const admin = adminClient();
  const { data: b } = await admin.from("tenants").select("id, brand_id").eq("slug", OWNER_B.slug).single();
  if (b!.brand_id) throw new Error("bun-bo đang thuộc một thương hiệu — dọn tay trước khi chạy test.");
  // Chỉ dọn khi CHÍNH test này đã dựng: quán demo đang thuộc thương hiệu của người dùng thì afterAll không được gỡ.
  daDung = true;
  tenantB = b!.id as string;

  const su = await taoTaiKhoan("super");
  await admin.from("super_admins").insert({ user_id: su.id });
  superAdmin = await signInAs(su.email, su.password);

  // Nhân viên thu ngân của bun-bo (không thuộc thương hiệu).
  const c = await taoTaiKhoan("cashier");
  await admin.from("memberships").insert({ tenant_id: tenantB, user_id: c.id, role: "cashier", display_name: "P15", active: true });
  cashierB = await signInAs(c.email, c.password);

  const { data: id, error } = await superAdmin.rpc("create_brand", { p_name: "P15 Test Chain", p_slug: BRAND_SLUG });
  if (error) throw error;
  brandId = id as string;
  const { error: e2 } = await superAdmin.rpc("attach_tenant_to_brand", { p_tenant: tenantB, p_brand: brandId });
  if (e2) throw e2;

  manager = await taoTaiKhoan("manager");
  const { error: e3 } = await superAdmin.rpc("set_brand_member", { p_brand: brandId, p_user: manager.id, p_role: "manager" });
  if (e3) throw e3;

  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
  managerB = await signInAs(manager.email, manager.password);
}, 120_000);

afterAll(async () => {
  if (!daDung) return;
  const admin = adminClient();
  await admin.from("tenants").delete().like("slug", `p15-%-${TAG}`);
  await admin.from("tenants").update({ brand_id: null }).eq("id", tenantB);
  if (brandId) await admin.from("brands").delete().eq("id", brandId);
  const ids = tam.map((t) => t.id);
  await admin.from("memberships").delete().in("user_id", ids);
  await admin.from("super_admins").delete().in("user_id", ids);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}, 120_000);

describe("brands / brand_members — RLS", () => {
  it("chủ thương hiệu (owner B) đọc được thương hiệu + thành viên; owner A (quán lẻ khác) = 0 dòng", async () => {
    expect(((await ownerB.from("brands").select("id").eq("id", brandId)).data ?? []).length).toBe(1);
    expect(((await ownerB.from("brand_members").select("user_id").eq("brand_id", brandId)).data ?? []).length).toBe(2);
    expect((await ownerA.from("brands").select("id").eq("id", brandId)).data ?? []).toHaveLength(0);
    expect((await ownerA.from("brand_members").select("user_id").eq("brand_id", brandId)).data ?? []).toHaveLength(0);
  }, 60_000);

  it("thu ngân của chi nhánh không đọc được brands / brand_members", async () => {
    expect((await cashierB.from("brands").select("id")).data ?? []).toHaveLength(0);
    expect((await cashierB.from("brand_members").select("user_id")).data ?? []).toHaveLength(0);
  }, 60_000);

  it("không ai ngoài super-admin ghi thẳng brands / brand_members / tenants.brand_id", async () => {
    expect((await ownerB.from("brands").insert({ name: "X", slug: `x-${TAG}` })).error).not.toBeNull();
    expect((await ownerB.from("brand_members").insert({ brand_id: brandId, user_id: tam[0].id, role: "owner" })).error).not.toBeNull();
    const truoc = (await adminClient().from("tenants").select("brand_id").eq("slug", OWNER_A.slug).single()).data?.brand_id;
    await ownerA.from("tenants").update({ brand_id: brandId }).eq("slug", OWNER_A.slug);
    const { data } = await adminClient().from("tenants").select("brand_id").eq("slug", OWNER_A.slug).single();
    expect(data?.brand_id).toBe(truoc);
  }, 60_000);

  it("gắn quán (attach) chỉ super-admin", async () => {
    const { error } = await ownerB.rpc("attach_tenant_to_brand", { p_tenant: tenantB, p_brand: brandId });
    expect(error?.code).toBe("42501");
  }, 60_000);
});

describe("create_branch", () => {
  it("quản lý thương hiệu gọi → bị từ chối, không tạo gì", async () => {
    const { error } = await managerB.rpc("create_branch", { p_brand: brandId, p_name: "Không được", p_slug: `p15-cam-${TAG}` });
    expect(error?.code).toBe("42501");
    expect((await adminClient().from("tenants").select("id").eq("slug", `p15-cam-${TAG}`)).data ?? []).toHaveLength(0);
  }, 60_000);

  it("chủ thương hiệu tạo chi nhánh → tenant mới + membership cho MỌI thành viên, đúng vai; chép cài đặt", async () => {
    const { data: newId, error } = await ownerB.rpc("create_branch", { p_brand: brandId, p_name: "Chi nhánh 2", p_slug: BRANCH_SLUG });
    expect(error).toBeNull();
    const admin = adminClient();
    const { data: t } = await admin.from("tenants").select("brand_id, settings, paid_until").eq("id", newId).single();
    expect(t?.brand_id).toBe(brandId);
    const { data: goc } = await admin.from("tenants").select("settings").eq("id", tenantB).single();
    expect(t?.settings).toMatchObject({ ...(goc!.settings as object), onboarding_done: false, print_mode: "browser" });
    // bun-bo không giới hạn + chủ tự tạo (không phải super-admin) → có hạn từ hôm nay, không mở chi nhánh miễn phí.
    expect(t?.paid_until).toBe(homNayHanDung());

    const { data: mem } = await admin.from("memberships").select("user_id, role, active").eq("tenant_id", newId);
    const { data: ownerRow } = await admin.from("memberships").select("user_id").eq("tenant_id", tenantB).eq("role", "owner").limit(1).single();
    expect(mem).toEqual(
      expect.arrayContaining([
        { user_id: ownerRow!.user_id, role: "owner", active: true },
        { user_id: manager.id, role: "manager", active: true },
      ])
    );
  }, 60_000);

  it("đăng nhập MỘT lần: chủ thương hiệu đọc được cả hai chi nhánh", async () => {
    const b = await signInAs(OWNER_B.email, OWNER_B.password);
    const { data } = await b.from("tenants").select("slug").eq("brand_id", brandId);
    expect((data ?? []).map((r) => r.slug).sort()).toEqual([OWNER_B.slug, BRANCH_SLUG].sort());
  }, 60_000);

  it("mã trùng → lỗi, không tạo nửa chừng", async () => {
    const truoc = (await adminClient().from("tenants").select("id", { count: "exact", head: true })).count;
    const { error } = await ownerB.rpc("create_branch", { p_brand: brandId, p_name: "Trùng", p_slug: BRANCH_SLUG });
    expect(error).not.toBeNull();
    expect((await adminClient().from("tenants").select("id", { count: "exact", head: true })).count).toBe(truoc);
  }, 60_000);

  it("bỏ người khỏi thương hiệu → tắt quyền ở mọi chi nhánh; thêm lại → có lại", async () => {
    expect((await superAdmin.rpc("remove_brand_member", { p_brand: brandId, p_user: manager.id })).error).toBeNull();
    const dem = async () =>
      (await adminClient().from("memberships").select("tenant_id, active").eq("user_id", manager.id)).data ?? [];
    expect((await dem()).every((m) => !m.active)).toBe(true);
    expect((await dem()).length).toBe(2);
    expect((await superAdmin.rpc("set_brand_member", { p_brand: brandId, p_user: manager.id, p_role: "manager" })).error).toBeNull();
    expect((await dem()).every((m) => m.active)).toBe(true);
  }, 60_000);
});

describe("gỡ quán khỏi thương hiệu / xóa thương hiệu (0066)", () => {
  const memCua = async (tenant: string) =>
    (await adminClient().from("memberships").select("user_id, role, active, brand_id").eq("tenant_id", tenant)).data ?? [];

  it("chủ thương hiệu không gọi được gỡ / xóa", async () => {
    expect((await ownerB.rpc("detach_tenant_from_brand", { p_tenant: tenantB })).error?.code).toBe("42501");
    expect((await ownerB.rpc("delete_brand", { p_brand: brandId })).error?.code).toBe("42501");
  }, 60_000);

  it("gỡ chi nhánh do chuỗi tạo (không có chủ riêng) → quyền CHỦ giữ lại thành quyền thường, quyền quản lý chuỗi bị bỏ", async () => {
    const { data: t } = await adminClient().from("tenants").select("id").eq("slug", BRANCH_SLUG).single();
    expect((await superAdmin.rpc("detach_tenant_from_brand", { p_tenant: t!.id })).error).toBeNull();
    expect((await adminClient().from("tenants").select("brand_id").eq("id", t!.id).single()).data?.brand_id).toBeNull();
    const m = await memCua(t!.id);
    expect(m.filter((x) => x.role === "owner" && x.active && x.brand_id === null)).toHaveLength(1);
    expect(m.find((x) => x.user_id === manager.id)).toBeUndefined();
  }, 60_000);

  it("xóa thương hiệu → quán gốc trở lại quán lẻ: chủ quán giữ quyền vốn có, quản lý chuỗi mất quyền", async () => {
    expect((await superAdmin.rpc("delete_brand", { p_brand: brandId })).error).toBeNull();
    expect((await adminClient().from("brands").select("id").eq("id", brandId)).data ?? []).toHaveLength(0);
    expect((await adminClient().from("tenants").select("brand_id").eq("id", tenantB).single()).data?.brand_id).toBeNull();
    const m = await memCua(tenantB);
    expect(m.some((x) => x.role === "owner" && x.active)).toBe(true);
    expect(m.find((x) => x.user_id === manager.id)).toBeUndefined();
    await expect(signInAs(OWNER_B.email, OWNER_B.password)).resolves.toBeTruthy();
  }, 60_000);
});

describe("tạo quán với email chủ đã có (sửa lỗi đặt lại mật khẩu)", () => {
  it("email của chủ đang bán ở quán khác → giữ nguyên mật khẩu cũ", async () => {
    const kq = await provisionOwner(adminClient(), OWNER_B.email, "MatKhauMoiKhongDuocDung!");
    expect(kq).toMatchObject({ ok: true, created: false, passwordSet: false });
    await expect(signInAs(OWNER_B.email, OWNER_B.password)).resolves.toBeTruthy();
  }, 60_000);
});

describe("auth_tenant_ids() không đổi", () => {
  it("định nghĩa trong schema-snapshot vẫn là bản 0057 (không đọc brand)", () => {
    const snap = JSON.parse(fs.readFileSync("supabase/schema-snapshot.json", "utf8"));
    const def = Object.entries(snap.ham as Record<string, string>).find(([k]) => k === "auth_tenant_ids()")?.[1] ?? "";
    expect(def).toContain("public.tenant_usable(t.status, t.paid_until)");
    expect(def).not.toMatch(/brand/);
  });
});
