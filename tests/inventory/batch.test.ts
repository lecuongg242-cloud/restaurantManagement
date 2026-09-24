import { describe, it, expect } from "vitest";
import { planBatch } from "@/lib/inventory/batch";
import type { Ingredient } from "@/lib/inventory/types";

function ing(p: Partial<Ingredient> & Pick<Ingredient, "id" | "name">): Ingredient {
  return {
    kind: "purchased", base_unit: "g", purchase_unit: null, purchase_factor: 1, yield_pct: 100,
    must_count: false, batch_output_qty: null, last_unit_cost: null, last_cost_at: null, active: true, ...p,
  };
}

const xuong = ing({ id: "xuong", name: "Xương", last_unit_cost: 40 });
const hanh = ing({ id: "hanh", name: "Hành tây", last_unit_cost: 30, yield_pct: 80 });
const nuocDung = ing({ id: "nd", name: "Nước dùng", kind: "prepared", base_unit: "ml", batch_output_qty: 40_000 });
const ctx = { ingredients: new Map([xuong, hanh, nuocDung].map((i) => [i.id, i])), children: new Map() };
// 1 mẻ: 12 kg xương (480.000đ) + 3,2 kg hành đã sơ chế (÷ 0,8 = 4 kg thô, 120.000đ) = 600.000đ
const recipe = [
  { ingredient_id: "xuong", qty: 12_000 },
  { ingredient_id: "hanh", qty: 3_200 }, // ÷ 0,8 = 4.000 g thô × 30đ = 120.000đ
];

describe("phiếu chế biến mẻ (INV-05)", () => {
  it("nước dùng 40 l công thức, thực 38 l, con 600.000đ → 15.789đ/l, hụt 2 l", () => {
    const r = planBatch(nuocDung, recipe, 1, 38_000, ctx);
    // 480.000 + 120.000 = 600.000đ
    expect(r.costTotal).toBe(600_000);
    expect(Math.round(r.unitCost! * 1000)).toBe(15_789); // đ / lít
    expect(r.expectedQty).toBe(40_000);
    expect(r.shortfall).toBe(2_000);
  });

  it("trừ con theo lượng THÔ (đã chia yield)", () => {
    const r = planBatch(nuocDung, recipe, 1, 40_000, ctx);
    expect(r.consume).toEqual([
      { ingredient_id: "xuong", qty: 12_000 },
      { ingredient_id: "hanh", qty: 4_000 },
    ]);
  });

  it("2 mẻ trừ gấp đôi", () => {
    const r = planBatch(nuocDung, recipe, 2, 80_000, ctx);
    expect(r.consume[0].qty).toBe(24_000);
    expect(r.expectedQty).toBe(80_000);
    expect(r.shortfall).toBe(0);
  });

  it("thiếu giá con → unitCost null nhưng vẫn trừ được", () => {
    const noPrice = { ...ctx, ingredients: new Map([...ctx.ingredients, ["hanh", { ...hanh, last_unit_cost: null }]]) };
    const r = planBatch(nuocDung, recipe, 1, 40_000, noPrice);
    expect(r.unitCost).toBeNull();
    expect(r.costTotal).toBeNull();
    expect(r.consume).toHaveLength(2);
  });

  it("nấu dư hơn công thức → hụt âm, giữ nguyên dấu", () => {
    expect(planBatch(nuocDung, recipe, 1, 41_000, ctx).shortfall).toBe(-1_000);
  });

  it("sản lượng thực 0 → giá/đơn vị null, không chia 0", () => {
    expect(planBatch(nuocDung, recipe, 1, 0, ctx).unitCost).toBeNull();
  });
});
