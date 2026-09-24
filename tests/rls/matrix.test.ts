import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B } from "./setup";
import { adminClient, ALT_GROUP, cleanupFixtures, fid, IDX, seedFixtures } from "./fixtures";

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
  /**
   * Dòng mà A cố chèn vào tenant B. Dùng ĐÚNG khóa ngoại của B (qua `fid("B", …)`) để lý do duy
   * nhất bị từ chối là RLS, không phải vi phạm khóa ngoại. `newId` là uuid ngẫu nhiên — trùng
   * khóa chính sẽ che mất thứ cần đo.
   */
  insertRow: (tenantB: string, newId: string) => Record<string, unknown>;
  /** Trường A cố sửa trên dòng của B. Phải là cột vô hại, không đụng ràng buộc. */
  updatePatch: Record<string, unknown>;
};

const B = (n: number) => fid("B", n);
const MARK = "XAM-PHAM";

export const CASES: Case[] = [
  {
    table: "memberships",
    insertRow: (t, id) => ({ id, tenant_id: t, user_id: null, role: "cashier", display_name: MARK }),
    updatePatch: { display_name: MARK },
  },
  {
    table: "menu_categories",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "menu_items",
    insertRow: (t, id) => ({ id, tenant_id: t, category_id: B(1), name: MARK, base_price: 1_000 }),
    updatePatch: { name: MARK },
  },
  {
    table: "modifier_groups",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "modifier_options",
    insertRow: (t, id) => ({ id, tenant_id: t, group_id: B(3), name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "menu_item_modifier_groups",
    idColumn: "item_id",
    selectColumn: "item_id",
    // Cặp (món B, nhóm ALT của B) chưa tồn tại → bị từ chối là do RLS, không do trùng khóa chính.
    insertRow: (t) => ({ item_id: B(2), group_id: B(ALT_GROUP), tenant_id: t, sort_order: 77 }),
    updatePatch: { sort_order: 77 },
  },
  {
    table: "areas",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "tables",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK, qr_token: `xampham-${id.slice(0, 8)}` }),
    updatePatch: { name: MARK },
  },
  {
    table: "table_sessions",
    insertRow: (t, id) => ({ id, tenant_id: t, table_id: B(6), status: "open" }),
    updatePatch: { status: "closed" },
  },
  {
    table: "orders",
    insertRow: (t, id) => ({ id, tenant_id: t, channel: "dine_in", source: "staff", note: MARK }),
    updatePatch: { note: MARK },
  },
  {
    table: "order_items",
    insertRow: (t, id) => ({
      id,
      tenant_id: t,
      order_id: B(8),
      name_snapshot: MARK,
      unit_price_snapshot: 1_000,
      qty: 1,
    }),
    updatePatch: { name_snapshot: MARK },
  },
  {
    table: "order_item_modifiers",
    insertRow: (t, id) => ({ id, tenant_id: t, order_item_id: B(9), name_snapshot: MARK }),
    updatePatch: { name_snapshot: MARK },
  },
  {
    table: "bills",
    insertRow: (t, id) => ({ id, tenant_id: t, status: "open", subtotal: 0, total: 0, note: MARK }),
    updatePatch: { note: MARK },
  },
  {
    table: "bill_items",
    insertRow: (t, id) => ({
      id,
      tenant_id: t,
      bill_id: B(11),
      order_item_id: B(9),
      qty_allocated: 1,
      unit_price_snapshot: 1_000,
      amount: 1_000,
    }),
    updatePatch: { amount: 1_000 },
  },
  {
    table: "payments",
    insertRow: (t, id) => ({ id, tenant_id: t, bill_id: B(11), method: "cash", amount: 1, note: MARK }),
    updatePatch: { note: MARK },
  },
  {
    table: "print_jobs",
    insertRow: (t, id) => ({ id, tenant_id: t, type: "kitchen_ticket", payload: { marker: MARK } }),
    updatePatch: { status: "printed" },
  },
  {
    table: "reservations",
    insertRow: (t, id) => ({
      id,
      tenant_id: t,
      customer_name: MARK,
      customer_phone: "0900000001",
      party_size: 2,
      reserved_at: "2030-01-01T11:00:00Z",
    }),
    updatePatch: { customer_name: MARK },
  },
  {
    table: "staff_calls",
    insertRow: (t, id) => ({ id, tenant_id: t, table_id: B(6), table_name: MARK }),
    updatePatch: { table_name: MARK },
  },
  {
    table: "ingredients",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK, base_unit: "g" }),
    updatePatch: { name: MARK },
  },
  {
    table: "recipe_lines",
    // Nguyên liệu + option của B, cặp chưa tồn tại → lý do duy nhất bị từ chối là RLS, không phải trùng.
    insertRow: (t, id) => ({ id, tenant_id: t, ingredient_id: B(19), modifier_option_id: B(4), qty: 1 }),
    updatePatch: { qty: 99 },
  },
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
  it("ma trận phủ đủ 20 bảng có tenant_id", () => {
    expect(CASES).toHaveLength(20);
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
