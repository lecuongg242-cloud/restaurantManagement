/**
 * Hao hụt theo tiền, tách 4 nguồn (REPORT-14, QD-017 D9). Đọc từ bản chốt sổ.
 *
 *   hủy sau khi làm  = món hủy sau mốc in phiếu bếp (đã nằm trong lượng dùng theo đơn)
 *   hụt mẻ           = sản lượng công thức − thực, của bán thành phẩm
 *   xuất hủy         = phiếu hủy có lý do
 *   không giải thích = −độ lệch kiểm kê — CHỈ nguyên liệu đã kiểm; không kiểm thì không có số này,
 *                      và KHÔNG được hiện 0 (0 nghĩa là "khớp", không phải "không biết")
 */
export type WasteRow = {
  ingredient_id: string;
  name: string;
  unit_cost: number | null;
  counted: boolean;
  cancel_usage: number;
  batch_shortfall: number;
  waste_hong: number;
  waste_do_bo: number;
  waste_com_nv: number;
  waste_khac: number;
  adjust: number;
};

export type WasteSource = "cancel" | "shortfall" | "waste" | "unexplained";

export type WasteSummary = {
  total: number;
  bySource: Record<WasteSource, number>;
  pctOfRevenue: number | null;
  /** Có hao hụt nhưng thiếu giá — không định giá được. */
  unpricedIngredients: string[];
  uncountedIngredients: string[];
};

export function rowWaste(r: WasteRow): Record<WasteSource, number> | null {
  if (r.unit_cost === null) return null;
  const c = r.unit_cost;
  return {
    cancel: Math.round(r.cancel_usage * c),
    shortfall: Math.round(r.batch_shortfall * c),
    waste: Math.round((r.waste_hong + r.waste_do_bo + r.waste_com_nv + r.waste_khac) * c),
    unexplained: r.counted ? Math.round(-r.adjust * c) : 0,
  };
}

export function wasteBreakdown(rows: WasteRow[], revenue: number): WasteSummary {
  const bySource: Record<WasteSource, number> = { cancel: 0, shortfall: 0, waste: 0, unexplained: 0 };
  const unpriced = new Set<string>();
  const uncounted = new Set<string>();
  for (const r of rows) {
    if (!r.counted) uncounted.add(r.name);
    const w = rowWaste(r);
    if (!w) {
      const hasLoss =
        r.cancel_usage || r.batch_shortfall || r.waste_hong || r.waste_do_bo || r.waste_com_nv || r.waste_khac || (r.counted && r.adjust);
      if (hasLoss) unpriced.add(r.name);
      continue;
    }
    for (const k of Object.keys(bySource) as WasteSource[]) bySource[k] += w[k];
  }
  const total = bySource.cancel + bySource.shortfall + bySource.waste + bySource.unexplained;
  return {
    total,
    bySource,
    pctOfRevenue: revenue > 0 ? (total / revenue) * 100 : null,
    unpricedIngredients: [...unpriced],
    uncountedIngredients: [...uncounted],
  };
}

/** Lệch cùng một chiều ≥ 5 ngày kiểm liền nhau → gợi ý định lượng khai sai, không phải mất cắp. */
export function suspectRecipe(dailyUnexplained: number[], run = 5): boolean {
  let len = 0;
  let sign = 0;
  for (const v of dailyUnexplained) {
    const s = Math.sign(v);
    if (s !== 0 && s === sign) len += 1;
    else {
      sign = s;
      len = s === 0 ? 0 : 1;
    }
    if (len >= run) return true;
  }
  return false;
}
