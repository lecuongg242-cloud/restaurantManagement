import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { daInGanDay, CUA_SO_TRUNG_MS } from "@/lib/print/dedupe";
import { adminClient, cleanupFixtures, fid, IDX, seedFixtures } from "./fixtures";

/**
 * BUG "bấm in một lần nhưng ra nhiều tờ" — lưới an toàn phía server.
 *
 * Cửa sổ 3 giây chọn theo DỮ LIỆU THẬT của qt-food (24/09/2026), không phải cảm tính:
 *   • double-fire (remount, bấm đúp): 0,63 – 2 giây
 *   • in lại CÓ CHỦ Ý:                dồn ở > 10 giây
 * Ba giây nằm trong khoảng trống giữa hai cụm.
 *
 * Test này dùng đồng hồ thật thay vì giả lập: hàm so `created_at` do Postgres sinh với giờ máy
 * chạy app, nên giả lập đồng hồ sẽ bỏ lọt đúng thứ cần đo (lệch đồng hồ giữa hai bên).
 */
let tenantA = "";
const KHOA = "e2e-dedupe-order";

beforeAll(async () => {
  const ids = await seedFixtures();
  tenantA = ids.tenantA;
}, 120_000);

afterAll(async () => {
  await adminClient().from("print_jobs").delete().filter("payload->>orderId", "eq", KHOA);
  await cleanupFixtures();
}, 120_000);

async function ghiMotLuot() {
  const { error } = await adminClient().from("print_jobs").insert({
    tenant_id: tenantA,
    type: "kitchen_ticket",
    payload: { orderId: KHOA },
    status: "printed",
    printed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

describe("Chống ghi trùng lượt in", () => {
  it("chưa có lượt nào → không chặn", async () => {
    expect(await daInGanDay(adminClient(), tenantA, "kitchen_ticket", "orderId", KHOA)).toBe(false);
  });

  it("vừa in xong → CHẶN (đây là cú double-fire)", async () => {
    await ghiMotLuot();
    expect(await daInGanDay(adminClient(), tenantA, "kitchen_ticket", "orderId", KHOA)).toBe(true);
  });

  it("quá cửa sổ → KHÔNG chặn (nhân viên in lại có chủ ý phải in được)", async () => {
    await new Promise((r) => setTimeout(r, CUA_SO_TRUNG_MS + 800));
    expect(await daInGanDay(adminClient(), tenantA, "kitchen_ticket", "orderId", KHOA)).toBe(false);
  }, 20_000);

  it("khác loại phiếu thì không ảnh hưởng nhau", async () => {
    await ghiMotLuot(); // kitchen_ticket
    expect(await daInGanDay(adminClient(), tenantA, "customer_ticket", "orderId", KHOA)).toBe(false);
  });

  it("khác đơn thì không ảnh hưởng nhau", async () => {
    await ghiMotLuot();
    expect(
      await daInGanDay(adminClient(), tenantA, "kitchen_ticket", "orderId", "don-khac")
    ).toBe(false);
  });

  it("khác quán thì không ảnh hưởng nhau — không được rò chéo tenant", async () => {
    await ghiMotLuot();
    const tenantB = fid("B", IDX.orders); // id bất kỳ không phải tenantA
    expect(
      await daInGanDay(adminClient(), tenantB, "kitchen_ticket", "orderId", KHOA)
    ).toBe(false);
  });
});
