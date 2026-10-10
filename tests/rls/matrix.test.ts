import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, cleanupFixtures, seedFixtures } from "./fixtures";
import { CASES, targetIdOfB } from "./matrix-cases";

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
  it("ma trận phủ đủ 33 bảng có tenant_id", () => {
    expect(CASES).toHaveLength(33);
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

describe("RLS ghi: A không chạm được dữ liệu B", () => {
  /** Đếm số dòng của tenant B ở một bảng — dùng service role, chỉ để đối chiếu. */
  async function countOfB(table: string): Promise<number> {
    const { count, error } = await adminClient()
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantB);
    if (error) throw error;
    return count ?? 0;
  }

  it.each(CASES)("$table — A insert dòng mang tenant_id của B → bị từ chối", async (c) => {
    const before = await countOfB(c.table);

    const { error } = await a.from(c.table).insert(c.insertRow(tenantB, crypto.randomUUID()));
    expect(error, `RÒ RỈ: A chèn được vào ${c.table} của B`).not.toBeNull();

    // Khẳng định kép: không chỉ báo lỗi, mà thật sự không có dòng nào lọt xuống DB.
    expect(await countOfB(c.table), `RÒ RỈ: dòng của A lọt vào ${c.table} của B`).toBe(before);
  });

  it.each(CASES)("$table — A update dòng của B → 0 dòng đổi, dữ liệu B nguyên vẹn", async (c) => {
    const idCol = c.idColumn ?? "id";
    const targetId = targetIdOfB(c);
    const admin = adminClient();

    const { data: before } = await admin.from(c.table).select("*").eq(idCol, targetId).maybeSingle();
    expect(before, `fixture của B ở ${c.table} phải tồn tại trước khi thử sửa`).toBeTruthy();

    const { data: changed } = await a
      .from(c.table)
      .update(c.updatePatch)
      .eq(idCol, targetId)
      .select(idCol);
    expect(changed ?? [], `RÒ RỈ: A sửa được ${c.table} của B`).toHaveLength(0);

    const { data: after } = await admin.from(c.table).select("*").eq(idCol, targetId).maybeSingle();
    expect(after, `RÒ RỈ: dữ liệu B ở ${c.table} đã đổi`).toEqual(before);
  });

  it.each(CASES)("$table — A delete dòng của B → 0 dòng xóa, dòng B còn nguyên", async (c) => {
    const idCol = c.idColumn ?? "id";
    const targetId = targetIdOfB(c);

    const { data: removed } = await a.from(c.table).delete().eq(idCol, targetId).select(idCol);
    expect(removed ?? [], `RÒ RỈ: A xóa được ${c.table} của B`).toHaveLength(0);

    const { data: still } = await adminClient().from(c.table).select(idCol).eq(idCol, targetId);
    expect(still ?? [], `RÒ RỈ: dòng B ở ${c.table} đã bị xóa`).toHaveLength(1);
  });
});
