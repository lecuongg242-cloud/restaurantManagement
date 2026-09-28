import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";
import { docMenuSnapshot } from "@/lib/brand/menu-snapshot";
import { khongConThayDoi, planMenuSync } from "@/lib/brand/menu-sync";

/**
 * P15 15-03 (BRANCH-04) — sync_menu_from_root (0063) trên DB thật. Gốc = quán demo bun-bo (gắn tạm vào thương
 * hiệu thử), chi nhánh = tenant tạm. Món thử thêm vào bun-bo mang tên có TAG; afterAll dọn sạch.
 */
const TAG = crypto.randomUUID().slice(0, 6);
let tenantB = "";
let brandId = "";
let branchId = "";
let ownerB: SupabaseClient;
let managerC: SupabaseClient;
const tam: string[] = [];
let catRoot = "";
let itemRoot = "";

const admin = () => adminClient();
const dongBo = (c: SupabaseClient, pairs: unknown[] = []) => c.rpc("sync_menu_from_root", { p_target: branchId, p_pairs: pairs });
async function monChiNhanh() {
  const { data } = await admin().from("menu_items").select("id, base_price, is_available, active, price_locked").eq("tenant_id", branchId).eq("source_id", itemRoot).single();
  return data!;
}

let daDung = false;

beforeAll(async () => {
  await seedFixtures();
  const { data: b } = await admin().from("tenants").select("id, brand_id").eq("slug", OWNER_B.slug).single();
  if (b!.brand_id) throw new Error("bun-bo đang thuộc một thương hiệu — dọn tay trước khi chạy test.");
  // Chỉ dọn khi CHÍNH test này đã dựng: quán demo đang thuộc thương hiệu của người dùng thì afterAll không được gỡ.
  daDung = true;
  tenantB = b!.id as string;

  const email = `p15-sync-su-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data: su } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  tam.push(su.user!.id);
  await admin().from("super_admins").insert({ user_id: su.user!.id });
  const superAdmin = await signInAs(email, password);

  const { data: id } = await superAdmin.rpc("create_brand", { p_name: "P15 Sync", p_slug: `p15-sync-${TAG}` });
  brandId = id as string;
  await superAdmin.rpc("attach_tenant_to_brand", { p_tenant: tenantB, p_brand: brandId });
  const { data: nid, error } = await superAdmin.rpc("create_branch", { p_brand: brandId, p_name: "CN sync", p_slug: `p15-cnsync-${TAG}` });
  if (error) throw error;
  branchId = nid as string;

  const mEmail = `p15-sync-mg-${TAG}@test.local`;
  const { data: mg } = await admin().auth.admin.createUser({ email: mEmail, password, email_confirm: true });
  tam.push(mg.user!.id);
  await superAdmin.rpc("set_brand_member", { p_brand: brandId, p_user: mg.user!.id, p_role: "manager" });
  managerC = await signInAs(mEmail, password);

  const { data: c } = await admin().from("menu_categories").insert({ tenant_id: tenantB, name: `SYNC-${TAG}` }).select("id").single();
  catRoot = c!.id as string;
  const { data: it } = await admin().from("menu_items").insert({ tenant_id: tenantB, category_id: catRoot, name: `Món SYNC ${TAG}`, base_price: 50000 }).select("id").single();
  itemRoot = it!.id as string;

  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);
}, 120_000);

afterAll(async () => {
  if (!daDung) return;
  const a = admin();
  if (branchId) await a.from("tenants").delete().eq("id", branchId);
  await a.from("menu_items").delete().eq("tenant_id", tenantB).like("name", `%SYNC ${TAG}%`);
  await a.from("menu_categories").delete().eq("tenant_id", tenantB).eq("name", `SYNC-${TAG}`);
  await a.from("tenants").update({ brand_id: null }).eq("id", tenantB);
  if (brandId) await a.from("brands").delete().eq("id", brandId);
  await a.from("memberships").delete().in("user_id", tam);
  await a.from("super_admins").delete().in("user_id", tam);
  for (const id of tam) await a.auth.admin.deleteUser(id);
  await cleanupFixtures();
}, 120_000);

describe("sync_menu_from_root", () => {
  it("quản lý thương hiệu gọi → bị từ chối", async () => {
    expect((await dongBo(managerC)).error?.code).toBe("42501");
  }, 60_000);

  it("lần đầu: chi nhánh có đủ món gốc, còn món; xem trước lại (TS) = không còn gì", async () => {
    const { data, error } = await dongBo(ownerB);
    expect(error).toBeNull();
    expect((data as { them: number }).them).toBeGreaterThan(0);
    const m = await monChiNhanh();
    expect(m).toMatchObject({ base_price: 50000, is_available: true, active: true });
    const root = await docMenuSnapshot(admin(), tenantB);
    const cn = await docMenuSnapshot(admin(), branchId);
    expect(cn.items.filter((i) => i.source_id).length).toBe(root.items.length);
    expect(khongConThayDoi(planMenuSync(root, cn))).toBe(true);
  }, 60_000);

  it("chạy lần hai liền → không đổi gì (idempotent)", async () => {
    const { data } = await dongBo(ownerB);
    expect(data).toEqual({ them: 0, sua: 0, an: 0 });
  }, 60_000);

  it("đổi giá gốc → chi nhánh theo; chi nhánh khóa giá → giữ giá riêng; 'Theo giá chuỗi' → về giá gốc", async () => {
    await admin().from("menu_items").update({ base_price: 55000 }).eq("id", itemRoot);
    await dongBo(ownerB);
    expect((await monChiNhanh()).base_price).toBe(55000);

    const m = await monChiNhanh();
    await admin().from("menu_items").update({ base_price: 60000, price_locked: true }).eq("id", m.id);
    await admin().from("menu_items").update({ base_price: 58000 }).eq("id", itemRoot);
    await dongBo(ownerB);
    expect((await monChiNhanh()).base_price).toBe(60000);

    const { error } = await ownerB.rpc("unlock_item_price", { p_item: m.id });
    expect(error).toBeNull();
    expect(await monChiNhanh()).toMatchObject({ base_price: 58000, price_locked: false });
  }, 60_000);

  it("hết món ở chi nhánh → đồng bộ không đụng", async () => {
    const m = await monChiNhanh();
    await admin().from("menu_items").update({ is_available: false }).eq("id", m.id);
    await admin().from("menu_items").update({ name: `Món SYNC ${TAG} mới` }).eq("id", itemRoot);
    await dongBo(ownerB);
    expect((await monChiNhanh()).is_available).toBe(false);
  }, 60_000);

  it("lỗi giữa chừng → không đổi gì (một giao dịch)", async () => {
    await admin().from("menu_items").update({ base_price: 70000 }).eq("id", itemRoot);
    const { error } = await dongBo(ownerB, [{ kind: "item", branch_id: "khong-phai-uuid", root_id: "x" }]);
    expect(error).not.toBeNull();
    expect((await monChiNhanh()).base_price).toBe(58000);
  }, 60_000);

  it("món bị xóa ở gốc → ẩn ở chi nhánh, không xóa", async () => {
    await admin().from("menu_items").delete().eq("id", itemRoot);
    await dongBo(ownerB);
    expect(await monChiNhanh()).toMatchObject({ active: false });
  }, 60_000);
});
