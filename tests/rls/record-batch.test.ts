import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";

/**
 * INV-05 — `record_batch` ghi đủ 1 phiếu + 1 dòng ra mẻ + N dòng trừ con trong MỘT giao dịch, và
 * không cho quán khác ghi hộ hay trỏ vào nguyên liệu của quán khác.
 */
const db = adminClient();
let a: SupabaseClient;
let b: SupabaseClient;
let tenantA: string;
let tenantB: string;
const nd = randomUUID();
const xuong = randomUUID();
const hanh = randomUUID();

const args = (tenant: string, over: Record<string, unknown> = {}) => ({
  p_tenant: tenant,
  p_business_date: "2030-02-01",
  p_ingredient: nd,
  p_batch_count: 1,
  p_expected: 40_000,
  p_actual: 38_000,
  p_cost_total: 600_000,
  p_unit_cost: 600_000 / 38_000,
  p_created_by: null,
  p_consume: [
    { ingredient_id: xuong, qty: 12_000 },
    { ingredient_id: hanh, qty: 4_000 },
  ],
  ...over,
});

async function countBatchesOf(tenant: string) {
  const { count } = await db
    .from("production_batches")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant)
    .eq("ingredient_id", nd);
  return count ?? 0;
}

beforeAll(async () => {
  tenantA = await tenantIdBySlug(OWNER_A.slug);
  tenantB = await tenantIdBySlug(OWNER_B.slug);
  a = await signInAs(OWNER_A.email, OWNER_A.password);
  b = await signInAs(OWNER_B.email, OWNER_B.password);
  for (const row of [
    { id: nd, name: `RB nước dùng ${nd.slice(0, 6)}`, base_unit: "ml", kind: "prepared", batch_output_qty: 40_000 },
    { id: xuong, name: `RB xương ${xuong.slice(0, 6)}`, base_unit: "g" },
    { id: hanh, name: `RB hành ${hanh.slice(0, 6)}`, base_unit: "g" },
  ]) {
    const { error } = await db.from("ingredients").insert({ tenant_id: tenantA, ...row });
    if (error) throw new Error(error.message);
  }
}, 60_000);

afterAll(async () => {
  await db.from("stock_entries").delete().in("ingredient_id", [nd, xuong, hanh]);
  await db.from("production_batches").delete().eq("ingredient_id", nd);
  await db.from("ingredients").delete().in("id", [nd, xuong, hanh]);
}, 60_000);

describe("record_batch (INV-05)", () => {
  it("ghi đủ 1 phiếu + 1 batch_in + 2 batch_out cùng batch_id", async () => {
    const { data: batchId, error } = await a.rpc("record_batch", args(tenantA));
    expect(error).toBeNull();
    const { data: rows } = await db.from("stock_entries").select("kind, qty, ingredient_id").eq("batch_id", batchId);
    const byKind = (k: string) => (rows ?? []).filter((r) => r.kind === k);
    expect(byKind("batch_in")).toHaveLength(1);
    expect(Number(byKind("batch_in")[0].qty)).toBe(38_000);
    expect(byKind("batch_out").map((r) => Number(r.qty)).sort((x, y) => x - y)).toEqual([-12_000, -4_000]);
  });

  it("quán B gọi với p_tenant của A → bị từ chối, không ghi dòng nào", async () => {
    const before = await countBatchesOf(tenantA);
    const { error } = await b.rpc("record_batch", args(tenantA));
    expect(error).not.toBeNull();
    expect(await countBatchesOf(tenantA)).toBe(before);
  });

  it("quán B ghi cho chính mình nhưng trỏ nguyên liệu của A → bị từ chối", async () => {
    const { error } = await b.rpc("record_batch", args(tenantB));
    expect(error).not.toBeNull();
    expect(await countBatchesOf(tenantB)).toBe(0);
  });

  it("nguyên liệu con lạ (không thuộc quán) → rollback cả phiếu", async () => {
    const before = await countBatchesOf(tenantA);
    const { error } = await a.rpc(
      "record_batch",
      args(tenantA, { p_consume: [{ ingredient_id: randomUUID(), qty: 1 }] })
    );
    expect(error).not.toBeNull();
    expect(await countBatchesOf(tenantA)).toBe(before);
  });

  it("anon không gọi được", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc("record_batch", args(tenantA));
    expect(error).not.toBeNull();
  });
});
