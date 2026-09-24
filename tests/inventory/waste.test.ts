import { describe, it, expect } from "vitest";
import { wasteBreakdown, suspectRecipe, type WasteRow } from "@/lib/inventory/waste";

const row = (p: Partial<WasteRow>): WasteRow => ({
  ingredient_id: "bo", name: "Bò", unit_cost: 300, counted: false,
  cancel_usage: 0, batch_shortfall: 0, waste_hong: 0, waste_do_bo: 0, waste_com_nv: 0, waste_khac: 0, adjust: 0,
  ...p,
});

describe("hao hụt tách 4 nguồn (REPORT-14, QD-017 D9)", () => {
  it("Σ 4 nguồn = tổng", () => {
    const r = wasteBreakdown(
      [row({ cancel_usage: 100, waste_hong: 50, waste_com_nv: 20, counted: true, adjust: -30 }),
       row({ ingredient_id: "nd", name: "Nước dùng", unit_cost: 15, batch_shortfall: 2000 })],
      1_000_000
    );
    // hủy sau làm 100×300 = 30.000 · hụt mẻ 2.000×15 = 30.000 · xuất hủy (50+20)×300 = 21.000 · không giải thích 30×300 = 9.000
    expect(r.bySource).toEqual({ cancel: 30_000, shortfall: 30_000, waste: 21_000, unexplained: 9_000 });
    expect(r.total).toBe(90_000);
    expect(r.pctOfRevenue).toBeCloseTo(9, 6);
  });

  it("nguyên liệu chưa kiểm không có nguồn không giải thích", () => {
    const r = wasteBreakdown([row({ counted: false, adjust: -500 })], 1_000_000);
    expect(r.bySource.unexplained).toBe(0);
    expect(r.uncountedIngredients).toEqual(["Bò"]);
  });

  it("đếm dư giữ số âm", () => {
    const r = wasteBreakdown([row({ counted: true, adjust: 40 })], 1_000_000);
    expect(r.bySource.unexplained).toBe(-12_000);
  });

  it("thiếu giá → không định giá được, đếm riêng", () => {
    const r = wasteBreakdown([row({ unit_cost: null, waste_hong: 100 })], 1_000_000);
    expect(r.total).toBe(0);
    expect(r.unpricedIngredients).toEqual(["Bò"]);
  });

  it("doanh thu 0 → % null", () => {
    expect(wasteBreakdown([], 0).pctOfRevenue).toBeNull();
  });
});

describe("nghi định lượng khai sai", () => {
  it("5 ngày cùng dấu → nghi", () => {
    expect(suspectRecipe([-10, -5, -8, -1, -20])).toBe(true);
    expect(suspectRecipe([3, 1, 2, 4, 9])).toBe(true);
  });

  it("4 ngày hoặc đổi dấu → không", () => {
    expect(suspectRecipe([-10, -5, -8, -1])).toBe(false);
    expect(suspectRecipe([-10, -5, 8, -1, -20, -3])).toBe(false);
  });

  it("ngày lệch 0 cắt chuỗi", () => {
    expect(suspectRecipe([-1, -1, 0, -1, -1, -1])).toBe(false);
  });

  it("chuỗi 5 nằm giữa kỳ vẫn tính", () => {
    expect(suspectRecipe([4, -1, -1, -1, -1, -1, 2])).toBe(true);
  });
});
