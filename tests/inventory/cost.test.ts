import { describe, it, expect } from "vitest";
import { portionCost, unitCost, foodCostPct, type CostContext } from "@/lib/inventory/cost";
import type { Ingredient, RecipeLine } from "@/lib/inventory/types";

function ing(p: Partial<Ingredient> & Pick<Ingredient, "id" | "name">): Ingredient {
  return {
    kind: "purchased",
    base_unit: "g",
    purchase_unit: null,
    purchase_factor: 1,
    yield_pct: 100,
    must_count: false,
    batch_output_qty: null,
    last_unit_cost: null,
    last_cost_at: null,
    active: true,
    ...p,
  };
}

function ctx(list: Ingredient[], children: Record<string, RecipeLine[]> = {}): CostContext {
  return {
    ingredients: new Map(list.map((i) => [i.id, i])),
    children: new Map(Object.entries(children)),
  };
}

const banhPho = ing({ id: "bp", name: "Bánh phở", last_unit_cost: 20 }); // 20.000đ/kg
const bo = ing({ id: "bo", name: "Thịt bò", last_unit_cost: 280, yield_pct: 85 }); // 280.000đ/kg

describe("giá vốn một phần (INV-02)", () => {
  it("Phở bò = 29.353đ", () => {
    const r = portionCost(
      [
        { ingredient_id: "bp", qty: 150 },
        { ingredient_id: "bo", qty: 80 },
      ],
      ctx([banhPho, bo])
    );
    // 150 g × 20đ = 3.000 · 80 g ÷ 0,85 × 280đ = 26.352,94
    expect(Math.round(r.cost!)).toBe(29_353);
    expect(r.missing).toEqual([]);
  });

  it("thiếu giá → null + tên nguyên liệu", () => {
    const hanh = ing({ id: "hanh", name: "Hành lá" });
    const r = portionCost(
      [
        { ingredient_id: "bp", qty: 150 },
        { ingredient_id: "hanh", qty: 10 },
      ],
      ctx([banhPho, hanh])
    );
    expect(r.cost).toBeNull();
    expect(r.missing).toEqual(["Hành lá"]);
  });

  it("món chưa khai định lượng → null, không phải 0đ", () => {
    expect(portionCost([], ctx([])).cost).toBeNull();
  });

  it("bán thành phẩm lồng 2 cấp", () => {
    // Nước dùng: 1 mẻ 40.000 ml = 12.000 g xương (50đ/g) + nước màu (1 mẻ 1.000 ml = 500 g đường 30đ/g)
    const xuong = ing({ id: "xuong", name: "Xương", last_unit_cost: 50 });
    const duong = ing({ id: "duong", name: "Đường", last_unit_cost: 30 });
    const nuocMau = ing({ id: "nm", name: "Nước màu", kind: "prepared", base_unit: "ml", batch_output_qty: 1000 });
    const nuocDung = ing({ id: "nd", name: "Nước dùng", kind: "prepared", base_unit: "ml", batch_output_qty: 40_000 });
    const c = ctx([xuong, duong, nuocMau, nuocDung], {
      nm: [{ ingredient_id: "duong", qty: 500 }],
      nd: [
        { ingredient_id: "xuong", qty: 12_000 },
        { ingredient_id: "nm", qty: 200 },
      ],
    });
    // nước màu = 15.000 / 1.000 = 15đ/ml · nước dùng = (600.000 + 3.000) / 40.000 = 15,075đ/ml
    expect(unitCost("nm", c).cost).toBe(15);
    expect(unitCost("nd", c).cost).toBeCloseTo(15.075, 6);
    const bat = portionCost([{ ingredient_id: "nd", qty: 400 }], c);
    expect(bat.cost).toBeCloseTo(6_030, 6);
  });

  it("yield không áp cho bán thành phẩm", () => {
    const xuong = ing({ id: "xuong", name: "Xương", last_unit_cost: 50 });
    // yield_pct 50 khai nhầm trên bán thành phẩm phải bị bỏ qua: hụt đã nằm ở sản lượng mẻ.
    const nd = ing({ id: "nd", name: "Nước dùng", kind: "prepared", batch_output_qty: 100, yield_pct: 50 });
    const c = ctx([xuong, nd], { nd: [{ ingredient_id: "xuong", qty: 100 }] });
    expect(portionCost([{ ingredient_id: "nd", qty: 10 }], c).cost).toBe(500);
  });

  it("giá ghi đè theo ngày thắng giá gần nhất (dùng cho chốt sổ)", () => {
    const c = { ...ctx([banhPho]), override: new Map([["bp", 25]]) };
    expect(portionCost([{ ingredient_id: "bp", qty: 100 }], c).cost).toBe(2_500);
  });

  it("vòng lọt vào dữ liệu không làm treo, trả null", () => {
    const a = ing({ id: "a", name: "A", kind: "prepared", batch_output_qty: 1 });
    const b = ing({ id: "b", name: "B", kind: "prepared", batch_output_qty: 1 });
    const c = ctx([a, b], { a: [{ ingredient_id: "b", qty: 1 }], b: [{ ingredient_id: "a", qty: 1 }] });
    expect(unitCost("a", c).cost).toBeNull();
  });
});

describe("food cost %", () => {
  it("29.353 / 55.000 = 53,37%", () => {
    expect(foodCostPct(29_353, 55_000)).toBeCloseTo(53.369, 2);
  });

  it("chia 0 → null", () => {
    expect(foodCostPct(10_000, 0)).toBeNull();
  });

  it("thiếu giá vốn → null", () => {
    expect(foodCostPct(null, 55_000)).toBeNull();
  });
});
