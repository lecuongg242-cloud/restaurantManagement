import type { DailyClosePayload } from "./close";
import { foodCostPct } from "./cost";

/**
 * Gộp lãi gộp theo món (REPORT-13): số của các ngày đã chốt (RPC) + phần "tạm tính" của hôm nay
 * (chưa chốt) định giá bằng bản xem trước chốt sổ. Lãi gộp CHỈ trên phần có giá vốn — thiếu giá
 * thì loại khỏi tổng và nói ra, không đoán (QD-017 D6).
 */
export type MarginRpcRow = {
  menu_item_id: string | null;
  name: string;
  qty: number;
  net_revenue: number;
  costed_revenue: number;
  cost_total: number;
  costed_qty: number;
  uncosted_qty: number;
};

export type OpenLine = { menu_item_id: string | null; qty: number; net_revenue: number; option_ids: string[] };

export type MarginItem = {
  key: string;
  menuItemId: string | null;
  name: string;
  qty: number;
  netRevenue: number;
  costedRevenue: number;
  costTotal: number;
  costedQty: number;
  uncostedQty: number;
  provisionalQty: number;
  /** Giá vốn trung bình / phần trên phần đã có giá vốn. */
  portionCost: number | null;
  grossProfit: number | null;
  foodCostPct: number | null;
};

export type MarginTotals = {
  netRevenue: number;
  costedRevenue: number;
  costTotal: number;
  grossProfit: number;
  uncostedQty: number;
  provisionalQty: number;
};

function lineCost(line: OpenLine, preview: DailyClosePayload): number | null {
  const item = preview.items.find((i) => i.menu_item_id === line.menu_item_id);
  if (!item || item.portion_cost === null) return null;
  let cost = item.portion_cost;
  for (const id of line.option_ids) {
    const o = preview.options.find((x) => x.modifier_option_id === id);
    if (!o) continue; // option không có định lượng → không trừ gì
    if (o.cost === null) return null;
    cost += o.cost;
  }
  return cost * line.qty;
}

export function mergeMargin(
  rows: MarginRpcRow[],
  open: OpenLine[],
  preview: DailyClosePayload | null
): { items: MarginItem[]; totals: MarginTotals } {
  const byKey = new Map<string, MarginItem>();
  for (const r of rows) {
    const key = r.menu_item_id ?? `name:${r.name}`;
    byKey.set(key, {
      key,
      menuItemId: r.menu_item_id,
      name: r.name,
      qty: Number(r.qty),
      netRevenue: Number(r.net_revenue),
      costedRevenue: Number(r.costed_revenue),
      costTotal: Number(r.cost_total),
      costedQty: Number(r.costed_qty),
      uncostedQty: Number(r.uncosted_qty),
      provisionalQty: 0,
      portionCost: null,
      grossProfit: null,
      foodCostPct: null,
    });
  }

  if (preview) {
    for (const l of open) {
      const m = l.menu_item_id ? byKey.get(l.menu_item_id) : undefined;
      if (!m) continue;
      const c = lineCost(l, preview);
      if (c === null) continue;
      m.costTotal += c;
      m.costedQty += l.qty;
      m.uncostedQty -= l.qty;
      m.costedRevenue += Number(l.net_revenue);
      m.provisionalQty += l.qty;
    }
  }

  const items = [...byKey.values()].map((m) => {
    if (m.costedQty === 0) return m;
    return {
      ...m,
      portionCost: m.costTotal / m.costedQty,
      grossProfit: Math.round(m.costedRevenue - m.costTotal),
      foodCostPct: foodCostPct(m.costTotal, m.costedRevenue),
    };
  });
  items.sort((a, b) => (b.grossProfit ?? -Infinity) - (a.grossProfit ?? -Infinity));

  const totals = items.reduce<MarginTotals>(
    (t, m) => ({
      netRevenue: t.netRevenue + m.netRevenue,
      costedRevenue: t.costedRevenue + m.costedRevenue,
      costTotal: t.costTotal + m.costTotal,
      grossProfit: t.grossProfit + (m.grossProfit ?? 0),
      uncostedQty: t.uncostedQty + m.uncostedQty,
      provisionalQty: t.provisionalQty + m.provisionalQty,
    }),
    { netRevenue: 0, costedRevenue: 0, costTotal: 0, grossProfit: 0, uncostedQty: 0, provisionalQty: 0 }
  );
  return { items, totals };
}
