import type { Ingredient, RecipeLine } from "./types";
import { MAX_DEPTH } from "./recipe-graph";

/**
 * Giá vốn (INV-02, QD-017 D3/D6). MỘT công thức dùng chung cho màn định lượng (10-01) và bản chốt
 * sổ (10-03) — hai nơi tính khác nhau là hai con số khác nhau cho cùng một bát phở.
 *
 * Lượng cần thật = định lượng ÷ yield. Yield chỉ áp cho nguyên liệu MUA VÀO; hụt của bán thành
 * phẩm đã nằm ở sản lượng mẻ, áp thêm yield là trừ hai lần.
 */

export type CostContext = {
  ingredients: Map<string, Ingredient>;
  /** Bán thành phẩm → công thức 1 mẻ. */
  children: Map<string, RecipeLine[]>;
  /** Giá theo ngày (10-03) ghi đè giá gần nhất. Có khóa mà giá trị null = ngày đó chưa đủ giá. */
  override?: Map<string, number | null>;
};

export type CostResult = { cost: number | null; missing: string[] };

/** Lượng thật phải lấy ra khỏi kho cho một dòng định lượng. */
export function requiredQty(line: RecipeLine, ingredient: Ingredient | undefined): number {
  if (!ingredient || ingredient.kind === "prepared") return line.qty;
  const y = ingredient.yield_pct > 0 ? ingredient.yield_pct : 100;
  return line.qty / (y / 100);
}

/** Giá của 1 đơn vị gốc. `null` = chưa đủ giá; `missing` nêu tên nguyên liệu lá thiếu giá. */
export function unitCost(id: string, ctx: CostContext, level = 0): CostResult {
  const ing = ctx.ingredients.get(id);
  if (!ing) return { cost: null, missing: ["(nguyên liệu đã xóa)"] };

  if (ctx.override?.has(id)) {
    const v = ctx.override.get(id) ?? null;
    return v === null ? { cost: null, missing: [ing.name] } : { cost: v, missing: [] };
  }

  if (ing.kind === "purchased") {
    return ing.last_unit_cost === null
      ? { cost: null, missing: [ing.name] }
      : { cost: ing.last_unit_cost, missing: [] };
  }

  // Bán thành phẩm (lý thuyết): Σ con ÷ sản lượng công thức. Quá sâu = vòng lọt vào dữ liệu.
  if (level >= MAX_DEPTH + 1) return { cost: null, missing: [ing.name] };
  const lines = ctx.children.get(id) ?? [];
  if (lines.length === 0 || !ing.batch_output_qty) return { cost: null, missing: [ing.name] };
  const batch = sumLines(lines, ctx, level + 1);
  return batch.cost === null
    ? batch
    : { cost: batch.cost / ing.batch_output_qty, missing: [] };
}

function sumLines(lines: RecipeLine[], ctx: CostContext, level: number): CostResult {
  let total = 0;
  const missing: string[] = [];
  for (const line of lines) {
    const u = unitCost(line.ingredient_id, ctx, level);
    if (u.cost === null) {
      for (const m of u.missing) if (!missing.includes(m)) missing.push(m);
      continue;
    }
    total += requiredQty(line, ctx.ingredients.get(line.ingredient_id)) * u.cost;
  }
  return missing.length > 0 ? { cost: null, missing } : { cost: total, missing: [] };
}

/** Giá vốn 1 phần. Món chưa khai định lượng → null (không phải 0đ). */
export function portionCost(lines: RecipeLine[], ctx: CostContext): CostResult {
  if (lines.length === 0) return { cost: null, missing: [] };
  return sumLines(lines, ctx, 0);
}

/** % giá vốn trên giá bán. */
export function foodCostPct(cost: number | null, price: number): number | null {
  if (cost === null || !(price > 0)) return null;
  return (cost / price) * 100;
}
