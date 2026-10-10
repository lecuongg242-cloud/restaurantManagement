import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_B } from "./setup";
import { adminClient } from "./fixtures";
import { homNayHanDung } from "@/lib/tenant/subscription";

/**
 * P15 — chủ chuỗi tự thêm chi nhánh trong admin quán (`create_my_branch`). Từ 0088 (chủ dự án 10/10/2026) quán lẻ KHÔNG
 * tự lập chuỗi được: super-admin tạo thương hiệu và gắn quán trước (`create_brand` + `attach_tenant_to_brand`). Chỉ đụng
 * quán demo bun-bo; afterAll gỡ sạch (xóa thương hiệu bằng delete_brand — quyền vốn có của chủ bun-bo giữ nguyên, 0066).
 */
const TAG = crypto.randomUUID().slice(0, 6);
let tenantB = "";
let ownerB: SupabaseClient;
let cashier: SupabaseClient;
let superAdmin: SupabaseClient;
const tam: string[] = [];
let daDung = false;

beforeAll(async () => {
  const a = adminClient();
  const { data: b } = await a.from("tenants").select("id, brand_id").eq("slug", OWNER_B.slug).single();
  if (b!.brand_id) throw new Error("bun-bo đang thuộc một thương hiệu — dọn tay trước khi chạy test.");
  tenantB = b!.id as string;
  daDung = true;
  const tao = async (nhan: string) => {
    const email = `p15-own-${nhan}-${TAG}@test.local`;
    const password = crypto.randomBytes(18).toString("base64url");
    const { data } = await a.auth.admin.createUser({ email, password, email_confirm: true });
    tam.push(data.user!.id);
    return { id: data.user!.id, email, password };
  };
  const c = await tao("cashier");
  await a.from("memberships").insert({ tenant_id: tenantB, user_id: c.id, role: "cashier", display_name: "P15", active: true });
  cashier = await signInAs(c.email, c.password);
  const su = await tao("su");
  await a.from("super_admins").insert({ user_id: su.id });
  superAdmin = await signInAs(su.email, su.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
}, 120_000);

afterAll(async () => {
  if (!daDung) return;
  const a = adminClient();
  const { data: t } = await a.from("tenants").select("brand_id").eq("id", tenantB).single();
  if (t?.brand_id) await superAdmin.rpc("delete_brand", { p_brand: t.brand_id });
  await a.from("tenants").delete().like("slug", `p15-own-%-${TAG}`);
  await a.from("memberships").delete().in("user_id", tam);
  await a.from("super_admins").delete().in("user_id", tam);
  for (const id of tam) await a.auth.admin.deleteUser(id);
}, 120_000);

describe("create_my_branch", () => {
  it("thu ngân gọi → bị từ chối, không lập chuỗi", async () => {
    const { error } = await cashier.rpc("create_my_branch", { p_from_tenant: tenantB, p_name: "X", p_slug: `p15-own-x-${TAG}` });
    expect(error?.code).toBe("42501");
    expect((await adminClient().from("tenants").select("brand_id").eq("id", tenantB).single()).data?.brand_id).toBeNull();
  }, 60_000);

  it("chủ quán LẺ gọi → bị từ chối (chưa đăng ký chuỗi), không lập chuỗi, không tạo quán", async () => {
    const { error } = await ownerB.rpc("create_my_branch", { p_from_tenant: tenantB, p_name: "X", p_slug: `p15-own-le-${TAG}` });
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/chua dang ky chuoi/);
    const a = adminClient();
    expect((await a.from("tenants").select("brand_id").eq("id", tenantB).single()).data?.brand_id).toBeNull();
    expect((await a.from("tenants").select("id").eq("slug", `p15-own-le-${TAG}`)).data ?? []).toHaveLength(0);
  }, 60_000);

  it("super-admin đăng ký chuỗi cho quán → chủ chuỗi tự thêm chi nhánh, quán là gốc", async () => {
    const { data: brandId, error: e1 } = await superAdmin.rpc("create_brand", { p_name: `P15 ${TAG}`, p_slug: `p15-own-${TAG}` });
    expect(e1).toBeNull();
    expect((await superAdmin.rpc("attach_tenant_to_brand", { p_tenant: tenantB, p_brand: brandId })).error).toBeNull();
    const { data: id, error } = await ownerB.rpc("create_my_branch", { p_from_tenant: tenantB, p_name: "Chi nhánh 2", p_slug: `p15-own-cn2-${TAG}` });
    expect(error).toBeNull();
    const a = adminClient();
    const { data: goc } = await a.from("tenants").select("brand_id, name").eq("id", tenantB).single();
    expect(goc?.brand_id).toBe(brandId);
    const { data: brand } = await a.from("brands").select("root_tenant_id").eq("id", goc!.brand_id).single();
    expect(brand).toMatchObject({ root_tenant_id: tenantB });
    const { data: moi } = await a.from("tenants").select("brand_id, paid_until").eq("id", id).single();
    expect(moi?.brand_id).toBe(goc!.brand_id);
    // bun-bo không giới hạn → chi nhánh mới có hạn từ hôm nay (tính vào lần gia hạn), không mở miễn phí.
    expect(moi?.paid_until).toBe(homNayHanDung());
    const b = await signInAs(OWNER_B.email, OWNER_B.password);
    expect(((await b.from("tenants").select("id").eq("brand_id", goc!.brand_id)).data ?? []).length).toBe(2);
  }, 60_000);

  it("tạo tiếp → cùng chuỗi; mã trùng → lỗi", async () => {
    const a = adminClient();
    const brand = (await a.from("tenants").select("brand_id").eq("id", tenantB).single()).data!.brand_id;
    expect((await ownerB.rpc("create_my_branch", { p_from_tenant: tenantB, p_name: "Chi nhánh 3", p_slug: `p15-own-cn3-${TAG}` })).error).toBeNull();
    expect((await a.from("tenants").select("id").eq("brand_id", brand)).data ?? []).toHaveLength(3);
    expect((await ownerB.rpc("create_my_branch", { p_from_tenant: tenantB, p_name: "Trùng", p_slug: `p15-own-cn3-${TAG}` })).error).not.toBeNull();
  }, 60_000);
});
