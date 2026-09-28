import { describe, it, expect } from "vitest";
import { canNguyenLieu, goiYNhap } from "@/lib/forecast/ingredients";
import { portionCost, type CostContext } from "@/lib/inventory/cost";
import type { Ingredient, RecipeLine } from "@/lib/inventory/types";

/** P18 18-02 (AI-03): nhu cầu nguyên liệu = món dự báo × định lượng, bung bán thành phẩm như P10. */
const ing = (id: string, o: Partial<Ingredient> = {}): Ingredient => ({
  id, name: id, kind: "purchased", base_unit: "g", purchase_unit: null, purchase_factor: 1, yield_pct: 100,
  must_count: false, batch_output_qty: null, last_unit_cost: null, last_cost_at: null, active: true, ...o,
});

function ctx(list: Ingredient[], children: Record<string, RecipeLine[]> = {}): CostContext {
  return { ingredients: new Map(list.map((i) => [i.id, i])), children: new Map(Object.entries(children)) };
}

describe("canNguyenLieu", () => {
  it("2 phần × 150 g thịt, yield 90% → 333,33 g", () => {
    const c = ctx([ing("thit", { yield_pct: 90 })]);
    const r = canNguyenLieu([{ itemKey: "pho", qty: 2 }], new Map([["pho", [{ ingredient_id: "thit", qty: 150 }]]]), c);
    expect(r.can.get("thit")).toBeCloseTo((2 * 150) / 0.9, 6);
  });

  it("bán thành phẩm lồng 2 tầng → bung ra đúng lượng mà giá vốn P10 dùng (Σ lượng × giá = giá vốn)", () => {
    // Phở: 300 ml nước dùng + 100 g bánh. Nước dùng (mẻ 10.000 ml) = 5.000 g xương (yield 80%) + 2.000 ml nước cốt.
    // Nước cốt (mẻ 1.000 ml) = 500 g hành (yield 50%).
    const list = [
      ing("banh", { last_unit_cost: 20 }),
      ing("xuong", { yield_pct: 80, last_unit_cost: 50 }),
      ing("hanh", { yield_pct: 50, last_unit_cost: 30 }),
      ing("nuoc-dung", { kind: "prepared", base_unit: "ml", batch_output_qty: 10_000 }),
      ing("nuoc-cot", { kind: "prepared", base_unit: "ml", batch_output_qty: 1_000 }),
    ];
    const c = ctx(list, {
      "nuoc-dung": [{ ingredient_id: "xuong", qty: 5_000 }, { ingredient_id: "nuoc-cot", qty: 2_000 }],
      "nuoc-cot": [{ ingredient_id: "hanh", qty: 500 }],
    });
    const dl: RecipeLine[] = [{ ingredient_id: "nuoc-dung", qty: 300 }, { ingredient_id: "banh", qty: 100 }];
    const r = canNguyenLieu([{ itemKey: "pho", qty: 40 }], new Map([["pho", dl]]), c);

    // 40 bát = 12.000 ml nước dùng = 1,2 mẻ → 6.000 g xương cần / 0,8 = 7.500 g; 2.400 ml nước cốt = 2,4 mẻ → 1.200 g hành / 0,5.
    expect(r.can.get("xuong")).toBeCloseTo(7_500, 6);
    expect(r.can.get("hanh")).toBeCloseTo(2_400, 6);
    expect(r.can.get("banh")).toBeCloseTo(4_000, 6);
    expect(r.can.has("nuoc-dung")).toBe(false); // chỉ nguyên liệu mua vào

    const giaTuNhuCau = [...r.can].reduce((s, [id, q]) => s + q * c.ingredients.get(id)!.last_unit_cost!, 0);
    expect(giaTuNhuCau).toBeCloseTo(40 * portionCost(dl, c).cost!, 6);
  });

  it("bán thành phẩm còn tồn → dùng trước, chỉ nấu phần thiếu", () => {
    const c = ctx([ing("xuong"), ing("nuoc-dung", { kind: "prepared", batch_output_qty: 1_000 })], {
      "nuoc-dung": [{ ingredient_id: "xuong", qty: 500 }],
    });
    const r = canNguyenLieu(
      [{ itemKey: "pho", qty: 10 }],
      new Map([["pho", [{ ingredient_id: "nuoc-dung", qty: 300 }]]]),
      c,
      new Map([["nuoc-dung", 1_000]])
    );
    expect(r.banThanhPham).toEqual([{ id: "nuoc-dung", can: 3_000, ton: 1_000, phaiNau: 2_000 }]);
    expect(r.can.get("xuong")).toBeCloseTo(1_000, 6);
  });

  it("món chưa khai định lượng → liệt kê; 'khac' (món mới gộp) không tính là thiếu", () => {
    const r = canNguyenLieu([{ itemKey: "tra-da", qty: 5 }, { itemKey: "khac", qty: 3 }], new Map(), ctx([]));
    expect(r.chuaKhai).toEqual(["tra-da"]);
    expect(r.can.size).toBe(0);
  });
});

describe("goiYNhap", () => {
  const c = ctx([ing("thit", { purchase_unit: "kg", purchase_factor: 1000 }), ing("trung", { base_unit: "cai", purchase_unit: "vỉ", purchase_factor: 30 })]);

  it("tồn đủ → gợi ý 0", () => {
    const [g] = goiYNhap(new Map([["thit", 1_000]]), new Map([["thit", 5_000]]), c);
    expect(g).toMatchObject({ goiY: 0, lyDo: "du" });
  });

  it("làm tròn LÊN theo đơn vị nhập: cần 2.300 g + 10% − tồn 500 → 2,03 kg → 3 kg", () => {
    const [g] = goiYNhap(new Map([["thit", 2_300]]), new Map([["thit", 500]]), c);
    expect(g).toMatchObject({ goiY: 3, lyDo: "thieu" });
  });

  it("vừa đúng số nguyên đơn vị nhập không bị làm tròn thêm", () => {
    const [g] = goiYNhap(new Map([["trung", 60]]), new Map(), c, 0);
    expect(g.goiY).toBe(2);
  });

  it("tồn âm (tồn lý thuyết sai) → gợi ý theo nhu cầu + cảnh báo kiểm kê lại", () => {
    const [g] = goiYNhap(new Map([["thit", 1_000]]), new Map([["thit", -400]]), c, 0);
    expect(g).toMatchObject({ goiY: 1, lyDo: "ton-am" });
  });
});
