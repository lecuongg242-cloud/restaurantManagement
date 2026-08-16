import { describe, it, expect } from "vitest";
import { groupTakeawayOrders } from "@/lib/orders/takeaway-group";
import type { OnlineOrderView } from "@/lib/orders/online";

/** Gom nhóm "gọi thêm" cho đơn không gắn bàn (ORDER-14 · QD-011). Hàm thuần → không cần DB. */

let seq = 0;
const order = (
  id: string,
  parentOrderId: string | null,
  total: number,
  kitchenNo = ++seq
): OnlineOrderView => ({
  id,
  channel: "takeaway",
  status: "confirmed",
  kitchenNo,
  createdAt: `2026-07-27T10:0${kitchenNo}:00Z`,
  note: null,
  contact: {},
  parentOrderId,
  total,
  cancelReason: null,
  cancelledAt: null,
  // Một dòng món khớp `total` — nhóm cộng theo `total` nên chi tiết không ảnh hưởng.
  items: [
    {
      id: `${id}-i1`,
      name: "Món",
      qty: 1,
      note: null,
      status: "queued",
      unitPrice: total,
      modifiers: [],
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
    },
  ],
});

describe("groupTakeawayOrders", () => {
  it("đơn rời rạc → mỗi đơn một nhóm, tổng giữ nguyên", () => {
    const g = groupTakeawayOrders([order("a", null, 50_000), order("b", null, 30_000)]);
    expect(g).toHaveLength(2);
    expect(g.map((x) => x.total)).toEqual([50_000, 30_000]);
    expect(g.every((x) => x.children.length === 0)).toBe(true);
  });

  it("gốc + 2 lượt gọi thêm → MỘT nhóm, tổng cộng dồn", () => {
    const g = groupTakeawayOrders([
      order("root", null, 50_000),
      order("c1", "root", 20_000),
      order("c2", "root", 15_000),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].root.id).toBe("root");
    expect(g[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(g[0].total).toBe(85_000);
  });

  it("giữ thứ tự thời gian của đơn GỐC, không bị con chen lên", () => {
    const g = groupTakeawayOrders([
      order("r1", null, 10_000),
      order("r2", null, 10_000),
      order("c1", "r1", 5_000),
    ]);
    expect(g.map((x) => x.root.id)).toEqual(["r1", "r2"]);
  });

  it("đơn con MỒ CÔI (gốc đã rời hàng đợi) vẫn hiện, không biến mất", () => {
    // Gốc đã hoàn tất/hủy nên không còn trong danh sách — con phải tự thành nhóm để còn thu tiền.
    const g = groupTakeawayOrders([order("c1", "root-da-roi", 20_000)]);
    expect(g).toHaveLength(1);
    expect(g[0].root.id).toBe("c1");
    expect(g[0].total).toBe(20_000);
  });

  it("newestFirst → nhóm mới nhất lên đầu, lượt gọi thêm TRONG nhóm vẫn theo thứ tự thời gian", () => {
    const g = groupTakeawayOrders(
      [order("r1", null, 10_000), order("r2", null, 10_000), order("c1", "r1", 5_000)],
      { newestFirst: true }
    );
    expect(g.map((x) => x.root.id)).toEqual(["r2", "r1"]);
    expect(g[1].children.map((c) => c.id)).toEqual(["c1"]);
  });

  it("danh sách rỗng → không nhóm nào", () => {
    expect(groupTakeawayOrders([])).toEqual([]);
  });

  it("tổng nhóm = Σ tổng từng đơn (không đếm trùng đơn gốc)", () => {
    const orders = [
      order("root", null, 12_000),
      order("c1", "root", 7_000),
      order("c2", "root", 3_000),
    ];
    const g = groupTakeawayOrders(orders);
    expect(g[0].total).toBe(orders.reduce((s, o) => s + o.total, 0));
  });
});
