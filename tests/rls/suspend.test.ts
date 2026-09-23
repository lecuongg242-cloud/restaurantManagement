import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";

/**
 * TENANT-06 — Ngưng một nhà hàng là cắt quyền THẬT, không phải một nhãn trên màn super-admin.
 * Ngưng B rồi kiểm: owner B mất sạch quyền đọc/ghi, owner A không hề bị ảnh hưởng, bật lại thì B
 * trở lại nguyên vẹn.
 */
const TABLES = ["memberships", "orders", "bills", "print_jobs", "menu_items", "tables"];

/** Chỉ được phép ngưng tenant demo. DB này dùng chung với nhà hàng đang hoạt động thật — ngưng
 *  nhầm một quán thật là làm POS của họ đứng giữa ca. */
const SUSPENDABLE = new Set([OWNER_B.slug]);

let tenantA: string;
let tenantB: string;

async function setStatus(slug: string, status: "active" | "suspended") {
  if (!SUSPENDABLE.has(slug)) {
    throw new Error(`Từ chối đổi trạng thái "${slug}" — chỉ cho phép: ${[...SUSPENDABLE].join(", ")}.`);
  }
  const { error } = await adminClient().from("tenants").update({ status }).eq("slug", slug);
  if (error) throw error;
}

/** Đăng nhập LẠI sau khi đổi status — phiên mới loại trừ mọi nghi ngờ về token hay cache. */
async function freshOwnerB(): Promise<SupabaseClient> {
  return signInAs(OWNER_B.email, OWNER_B.password);
}

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
}, 120_000);

afterAll(async () => {
  // Bật lại TRƯỚC khi dọn: để treo trạng thái suspended thì lần chạy sau (và các bộ test khác)
  // sẽ đỏ hàng loạt vì "không tìm thấy nhà hàng".
  await setStatus(OWNER_B.slug, "active");
  await cleanupFixtures();
}, 120_000);

describe("Khóa nhà hàng bằng tenants.status", () => {
  it("đối chứng: khi B đang active, owner B đọc được dữ liệu của mình", async () => {
    await setStatus(OWNER_B.slug, "active");
    const b = await freshOwnerB();
    for (const table of TABLES) {
      const { data, error } = await b.from(table).select("id").eq("tenant_id", tenantB);
      expect(error, `lỗi đọc ${table}`).toBeNull();
      expect((data ?? []).length, `${table}: B active phải đọc được`).toBeGreaterThan(0);
    }
  }, 60_000);

  it("ngưng B → owner B đọc mọi bảng đều ra 0 dòng", async () => {
    await setStatus(OWNER_B.slug, "suspended");
    const b = await freshOwnerB();
    for (const table of TABLES) {
      const { data, error } = await b.from(table).select("id").eq("tenant_id", tenantB);
      expect(error).toBeNull();
      expect(data ?? [], `${table}: quán bị ngưng vẫn đọc được`).toHaveLength(0);
    }
  }, 60_000);

  it("ngưng B → owner B không thấy cả dòng tenants của mình", async () => {
    await setStatus(OWNER_B.slug, "suspended");
    const b = await freshOwnerB();
    const { data } = await b.from("tenants").select("id");
    expect(data ?? []).toHaveLength(0);
  }, 60_000);

  it("ngưng B → owner B không GHI được nữa", async () => {
    await setStatus(OWNER_B.slug, "suspended");
    const b = await freshOwnerB();
    const { error } = await b
      .from("menu_categories")
      .insert({ tenant_id: tenantB, name: "SAU-KHI-NGUNG" });
    expect(error, "quán bị ngưng vẫn chèn được dữ liệu").not.toBeNull();
  }, 60_000);

  it("ngưng B KHÔNG ảnh hưởng quán A", async () => {
    await setStatus(OWNER_B.slug, "suspended");
    const a = await signInAs(OWNER_A.email, OWNER_A.password);
    const { data, error } = await a.from("orders").select("id").eq("tenant_id", tenantA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  }, 60_000);

  it("bật lại B → quyền trở lại đầy đủ, dữ liệu còn nguyên", async () => {
    await setStatus(OWNER_B.slug, "suspended");
    await setStatus(OWNER_B.slug, "active");
    const b = await freshOwnerB();
    for (const table of TABLES) {
      const { data } = await b.from(table).select("id").eq("tenant_id", tenantB);
      expect((data ?? []).length, `${table}: bật lại phải thấy dữ liệu cũ`).toBeGreaterThan(0);
    }
  }, 60_000);
});
