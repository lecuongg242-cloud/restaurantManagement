import type { Ingredient, RecipeLine } from "./types";
import { requiredQty, unitCost, type CostContext } from "./cost";

/**
 * Phiếu chế biến mẻ (INV-05, QD-017 D3). Trừ nguyên liệu con theo công thức × số mẻ, cộng sản
 * lượng THỰC vào bán thành phẩm. Giá / đơn vị = chi phí con ÷ sản lượng thực — hụt mẻ đổ vào giá
 * vốn, đúng như ngoài đời.
 */
export type BatchPlan = {
  /** Lượng THÔ (đã chia yield) lấy khỏi kho, đơn vị gốc. */
  consume: RecipeLine[];
  expectedQty: number;
  /** Sản lượng công thức − thực. Âm = nấu dư. */
  shortfall: number;
  costTotal: number | null;
  unitCost: number | null;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function planBatch(
  prepared: Ingredient,
  recipe: RecipeLine[],
  batchCount: number,
  actualQty: number,
  ctx: CostContext
): BatchPlan {
  const consume = recipe.map((l) => ({
    ingredient_id: l.ingredient_id,
    qty: round3(requiredQty(l, ctx.ingredients.get(l.ingredient_id)) * batchCount),
  }));

  let costTotal: number | null = 0;
  for (const c of consume) {
    const u = unitCost(c.ingredient_id, ctx);
    if (u.cost === null) {
      costTotal = null;
      break;
    }
    costTotal += c.qty * u.cost;
  }
  if (costTotal !== null) costTotal = Math.round(costTotal);

  const expectedQty = round3((prepared.batch_output_qty ?? 0) * batchCount);
  return {
    consume,
    expectedQty,
    shortfall: round3(expectedQty - actualQty),
    costTotal,
    unitCost: costTotal !== null && actualQty > 0 ? costTotal / actualQty : null,
  };
}
