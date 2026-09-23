import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, fid, IDX, seedFixtures } from "./fixtures";

/**
 * TENANT-05 — Ma trận cách ly tenant trên MỌI bảng mang tenant_id.
 * Phiên là owner thật + anon key, đúng như client production. Service role chỉ dựng fixture
 * và đối chiếu dữ liệu B sau phép ghi chéo.
 */
export type Case = {
  /** Tên bảng trong schema public. */
  table: string;
  /** Cột khóa để trỏ tới dòng fixture. Mặc định "id". */
  idColumn?: string;
  /** Cột dùng khi đọc (phải luôn tồn tại). Mặc định "id". */
  selectColumn?: string;
};

export const CASES: Case[] = [
  { table: "memberships" },
  { table: "menu_categories" },
  { table: "menu_items" },
  { table: "modifier_groups" },
  { table: "modifier_options" },
  { table: "menu_item_modifier_groups", idColumn: "item_id", selectColumn: "item_id" },
  { table: "areas" },
  { table: "tables" },
  { table: "table_sessions" },
  { table: "orders" },
  { table: "order_items" },
  { table: "order_item_modifiers" },
  { table: "bills" },
  { table: "bill_items" },
  { table: "payments" },
  { table: "print_jobs" },
  { table: "reservations" },
  { table: "staff_calls" },
];

/** Dòng fixture của tenant B ứng với một bảng. */
export function targetIdOfB(c: Case): string {
  return fid("B", IDX[c.table as keyof typeof IDX]);
}

let a: SupabaseClient;
let b: SupabaseClient;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
  tenantB = ids.tenantB;
  a = await signInAs(OWNER_A.email, OWNER_A.password);
  b = await signInAs(OWNER_B.email, OWNER_B.password);
}, 120_000);

afterAll(async () => {
  await cleanupFixtures();
}, 120_000);

describe("RLS đọc: tenant A ⊥ tenant B", () => {
  it("ma trận phủ đủ 18 bảng có tenant_id", () => {
    expect(CASES).toHaveLength(18);
  });

  it.each(CASES)("$table — đối chứng dương: A đọc dữ liệu của chính A", async (c) => {
    const col = c.selectColumn ?? "id";
    const { data, error } = await a.from(c.table).select(col).eq("tenant_id", tenantA);
    expect(error, `A đọc ${c.table} của chính mình không được phép lỗi`).toBeNull();
    expect((data ?? []).length, `${c.table}: fixture của A phải đọc được`).toBeGreaterThan(0);
  });

  it.each(CASES)("$table — A đọc dữ liệu của B → 0 dòng", async (c) => {
    const col = c.selectColumn ?? "id";
    const { data, error } = await a.from(c.table).select(col).eq("tenant_id", tenantB);
    expect(error).toBeNull();
    expect(data ?? [], `RÒ RỈ: A đọc được ${c.table} của B`).toHaveLength(0);
  });

  it.each(CASES)("$table — B đọc dữ liệu của A → 0 dòng (chiều ngược lại)", async (c) => {
    const col = c.selectColumn ?? "id";
    const { data, error } = await b.from(c.table).select(col).eq("tenant_id", tenantA);
    expect(error).toBeNull();
    expect(data ?? [], `RÒ RỈ: B đọc được ${c.table} của A`).toHaveLength(0);
  });

  it.each(CASES)("$table — A trỏ thẳng id của B vẫn không ra dòng nào", async (c) => {
    const idCol = c.idColumn ?? "id";
    const { data, error } = await a.from(c.table).select(idCol).eq(idCol, targetIdOfB(c));
    expect(error).toBeNull();
    expect(data ?? [], `RÒ RỈ: A trỏ thẳng id của B ở ${c.table} vẫn ra dòng`).toHaveLength(0);
  });
});
