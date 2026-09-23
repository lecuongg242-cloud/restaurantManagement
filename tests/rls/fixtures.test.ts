import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, seedFixtures, cleanupFixtures, fid, IDX } from "./fixtures";

/**
 * Fixture của ma trận RLS phải dựng được cho CẢ HAI tenant và dọn sạch sau khi chạy.
 * Không có bước này thì mọi "0 dòng" ở matrix.test.ts đều vô nghĩa — 0 dòng vì RLS chặn,
 * hay vì bảng vốn rỗng?
 */
describe("Fixture ma trận RLS", () => {
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    const ids = await seedFixtures();
    tenantA = ids.tenantA;
    tenantB = ids.tenantB;
  }, 120_000);

  afterAll(async () => {
    await cleanupFixtures();
  }, 120_000);

  it("hai tenant demo là hai tenant khác nhau", () => {
    expect(tenantA).not.toEqual(tenantB);
  });

  it("dựng đủ dòng fixture cho cả A và B ở mọi bảng trong ma trận", async () => {
    const admin = adminClient();
    for (const [table, n] of Object.entries(IDX)) {
      const idCol = table === "menu_item_modifier_groups" ? "item_id" : "id";
      const { data, error } = await admin
        .from(table)
        .select(idCol)
        .in(idCol, [fid("A", n), fid("B", n)]);
      expect(error, `lỗi đọc ${table}`).toBeNull();
      expect(data ?? [], `${table} phải có đủ 2 dòng fixture`).toHaveLength(2);
    }
  }, 60_000);

  it("chạy seedFixtures lần hai không lỗi (idempotent)", async () => {
    await expect(seedFixtures()).resolves.toBeTruthy();
  }, 120_000);
});
