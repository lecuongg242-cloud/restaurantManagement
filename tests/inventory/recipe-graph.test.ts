import { describe, it, expect } from "vitest";
import { checkRecipeChange, MAX_DEPTH } from "@/lib/inventory/recipe-graph";

/** Đồ thị: bán thành phẩm → danh sách nguyên liệu con. Nguyên liệu mua vào không có mục. */
function graph(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries));
}

describe("công thức lồng công thức (INV-03)", () => {
  it("giới hạn là 3 cấp", () => {
    expect(MAX_DEPTH).toBe(3);
  });

  it("vòng trực tiếp A→A bị chặn", () => {
    const r = checkRecipeChange(graph({}), "A", ["A"], new Set(["A"]));
    expect(r).toEqual({ ok: false, reason: "cycle", path: ["A", "A"] });
  });

  it("vòng gián tiếp A→B→C→A bị chặn", () => {
    const g = graph({ B: ["C"], C: ["A"] });
    const r = checkRecipeChange(g, "A", ["B"], new Set(["A", "B", "C"]));
    expect(r).toEqual({ ok: false, reason: "cycle", path: ["A", "B", "C", "A"] });
  });

  it("đúng 3 cấp lưu được", () => {
    // A (cấp 3) → B (cấp 2) → C (cấp 1) → xương (mua vào)
    const g = graph({ B: ["C"], C: ["xuong"] });
    const r = checkRecipeChange(g, "A", ["B"], new Set(["A", "B", "C"]));
    expect(r).toEqual({ ok: true });
  });

  it("4 cấp bị chặn", () => {
    const g = graph({ B: ["C"], C: ["D"], D: ["xuong"] });
    const r = checkRecipeChange(g, "A", ["B"], new Set(["A", "B", "C", "D"]));
    expect(r).toEqual({ ok: false, reason: "depth" });
  });

  it("sửa con làm cha của nó vượt 3 cấp cũng bị chặn", () => {
    // X (3) → Y (2) → Z (1). Sửa Z để dùng W (bán thành phẩm cấp 1) → X thành 4 cấp.
    const g = graph({ X: ["Y"], Y: ["Z"], Z: ["hanh"], W: ["xuong"] });
    const r = checkRecipeChange(g, "Z", ["W"], new Set(["X", "Y", "Z", "W"]));
    expect(r).toEqual({ ok: false, reason: "depth" });
  });

  it("hai nhánh cùng dùng một con không phải vòng", () => {
    const g = graph({ B: ["D"], C: ["D"], D: ["xuong"] });
    const r = checkRecipeChange(g, "A", ["B", "C"], new Set(["A", "B", "C", "D"]));
    expect(r).toEqual({ ok: true });
  });

  it("đồ thị có sẵn vòng (lọt do sửa đồng thời) không làm treo kiểm tra", () => {
    const g = graph({ B: ["C"], C: ["B"] });
    const r = checkRecipeChange(g, "A", ["hanh"], new Set(["A", "B", "C"]));
    expect(r.ok).toBe(false);
  });
});
