import { describe, it, expect } from "vitest";
import { mergeMargin, type MarginRpcRow } from "@/lib/inventory/margin";
import type { DailyClosePayload } from "@/lib/inventory/close";

const row = (p: Partial<MarginRpcRow>): MarginRpcRow => ({
  menu_item_id: "pho", name: "Phở", qty: 0, net_revenue: 0, costed_revenue: 0, cost_total: 0, costed_qty: 0, uncosted_qty: 0, ...p,
});
const preview: DailyClosePayload = {
  version: 1,
  ingredients: [],
  items: [
    { menu_item_id: "pho", name: "Phở", portion_cost: 20_000, missing: [] },
    { menu_item_id: "com", name: "Cơm", portion_cost: null, missing: ["Muối"] },
  ],
  options: [
    { modifier_option_id: "trung", name: "Trứng", cost: 3_000 },
    { modifier_option_id: "sot", name: "Sốt", cost: null },
  ],
};

describe("gộp lãi gộp + tạm tính hôm nay (REPORT-13)", () => {
  it("lãi gộp chỉ tính trên phần có giá vốn", () => {
    const r = mergeMargin([row({ qty: 5, net_revenue: 250_000, costed_revenue: 150_000, cost_total: 60_000, costed_qty: 3, uncosted_qty: 2 })], [], null);
    expect(r.items[0]).toMatchObject({ grossProfit: 90_000, portionCost: 20_000, uncostedQty: 2 });
    expect(r.items[0].foodCostPct).toBeCloseTo(40, 6);
    expect(r.totals).toMatchObject({ grossProfit: 90_000, uncostedQty: 2 });
  });

  it("dòng hôm nay có giá tạm tính → chuyển sang phần có giá vốn, đánh dấu tạm tính", () => {
    const r = mergeMargin(
      [row({ qty: 2, net_revenue: 100_000, uncosted_qty: 2 })],
      [
        { menu_item_id: "pho", qty: 1, net_revenue: 50_000, option_ids: ["trung"] },
        { menu_item_id: "pho", qty: 1, net_revenue: 50_000, option_ids: [] },
      ],
      preview
    );
    // (20.000 + 3.000) + 20.000 = 43.000
    expect(r.items[0]).toMatchObject({ costTotal: 43_000, costedQty: 2, uncostedQty: 0, provisionalQty: 2, grossProfit: 57_000 });
  });

  it("option thiếu giá → dòng vẫn chưa tính được", () => {
    const r = mergeMargin(
      [row({ qty: 1, net_revenue: 50_000, uncosted_qty: 1 })],
      [{ menu_item_id: "pho", qty: 1, net_revenue: 50_000, option_ids: ["sot"] }],
      preview
    );
    expect(r.items[0]).toMatchObject({ costedQty: 0, uncostedQty: 1, grossProfit: null });
  });

  it("món chưa đủ giá → không lãi gộp, không vào tổng", () => {
    const r = mergeMargin([row({ menu_item_id: "com", name: "Cơm", qty: 3, net_revenue: 90_000, uncosted_qty: 3 })], [], null);
    expect(r.items[0].grossProfit).toBeNull();
    expect(r.items[0].foodCostPct).toBeNull();
    expect(r.totals.grossProfit).toBe(0);
    expect(r.totals.uncostedQty).toBe(3);
  });

  it("xếp theo tổng lãi gộp, món không tính được xuống cuối", () => {
    const r = mergeMargin(
      [
        row({ menu_item_id: "a", name: "A", qty: 1, net_revenue: 10, costed_revenue: 10, cost_total: 5, costed_qty: 1 }),
        row({ menu_item_id: "b", name: "B", qty: 1, net_revenue: 99, uncosted_qty: 1 }),
        row({ menu_item_id: "c", name: "C", qty: 1, net_revenue: 100, costed_revenue: 100, cost_total: 20, costed_qty: 1 }),
      ],
      [],
      null
    );
    expect(r.items.map((i) => i.name)).toEqual(["C", "A", "B"]);
  });

  it("Σ doanh thu thuần giữ nguyên, không phụ thuộc giá vốn", () => {
    const r = mergeMargin([row({ qty: 1, net_revenue: 70_000, uncosted_qty: 1 }), row({ menu_item_id: "x", name: "X", qty: 1, net_revenue: 30_000, costed_revenue: 30_000, cost_total: 1, costed_qty: 1 })], [], null);
    expect(r.totals.netRevenue).toBe(100_000);
  });
});
