import type { Ingredient, RecipeLine, BaseUnit } from "./types";
import { portionCost, unitCost, type CostContext } from "./cost";
import { addDays } from "./day";

/**
 * Chốt sổ ngày (INV-09, QD-017 D6/D7). Hàm thuần: dựng payload từ số liệu `inventory_day` + giá.
 * Giá vốn đi qua ĐÚNG `portionCost` của màn định lượng (10-01) — một công thức cho mọi nơi.
 */

export type CostSource = "today" | `stale:${string}` | "none";

/** Một lần nhập / ra mẻ CÓ GIÁ. */
export type PricePoint = { business_date: string; qty: number; unit_cost: number };

/** Một dòng của RPC `inventory_day`. */
export type DayRow = {
  ingredient_id: string;
  opening: number;
  receipts: number;
  batch_in: number;
  batch_out: number;
  waste_hong: number;
  waste_do_bo: number;
  waste_com_nv: number;
  waste_khac: number;
  adjust: number;
  counted: boolean;
  order_usage: number;
  cancel_usage: number;
  batch_shortfall: number;
  closing: number;
};

export type ClosedIngredient = Omit<DayRow, "ingredient_id"> & {
  id: string;
  name: string;
  base_unit: BaseUnit;
  kind: Ingredient["kind"];
  unit_cost: number | null;
  cost_source: CostSource;
};

export type DailyClosePayload = {
  version: 1;
  ingredients: ClosedIngredient[];
  items: { menu_item_id: string; name: string; portion_cost: number | null; missing: string[] }[];
  options: { modifier_option_id: string; name: string; cost: number | null }[];
};

/**
 * Giá / đơn vị gốc của một nguyên liệu trong ngày `day`: bình quân gia quyền các lần có giá TRONG
 * ngày; không có → ngày gần nhất trước đó; không có nữa → giá khai tay trên danh mục nếu khai trước
 * ngày chốt. Lần nhập SAU ngày chốt không bao giờ được dùng — đang chốt bù ngày cũ thì giá hôm nay
 * không liên quan.
 */
export function dayUnitCost(
  points: PricePoint[],
  day: string,
  manual: { cost: number; date: string } | null
): { cost: number | null; source: CostSource } {
  const usable = points.filter((p) => p.business_date <= day && p.qty > 0);
  const onDay = usable.filter((p) => p.business_date === day);
  const pick = onDay.length > 0 ? day : usable.map((p) => p.business_date).sort().at(-1);
  if (pick) {
    const same = usable.filter((p) => p.business_date === pick);
    const qty = same.reduce((s, p) => s + p.qty, 0);
    const cost = same.reduce((s, p) => s + p.qty * p.unit_cost, 0) / qty;
    return { cost: Math.round(cost * 1e6) / 1e6, source: pick === day ? "today" : `stale:${pick}` };
  }
  if (manual && manual.date <= day) return { cost: manual.cost, source: `stale:${manual.date}` };
  return { cost: null, source: "none" };
}

/** Ngày cần chốt: từ sau bản chốt gần nhất (hoặc ngày có dòng sổ đầu tiên) tới HÔM QUA, tối đa `max`. */
export function daysToClose(
  lastClosed: string | null,
  firstEntry: string | null,
  today: string,
  max = 60
): string[] {
  let d = lastClosed ? addDays(lastClosed, 1) : firstEntry;
  if (!d) return [];
  const out: string[] = [];
  while (d < today && out.length < max) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export type CloseInput = {
  day: string;
  rows: DayRow[];
  ingredients: Ingredient[];
  byItem: Map<string, RecipeLine[]>;
  byOption: Map<string, RecipeLine[]>;
  byParent: Map<string, RecipeLine[]>;
  items: { id: string; name: string }[];
  options: { id: string; name: string }[];
  /** ingredient_id → các lần nhập (mua vào) / ra mẻ (bán thành phẩm) có giá, mọi ngày ≤ day. */
  prices: Map<string, PricePoint[]>;
};

export function buildDailyClose(input: CloseInput): DailyClosePayload {
  const override = new Map<string, number | null>();
  const source = new Map<string, CostSource>();
  for (const ing of input.ingredients) {
    const manual =
      ing.kind === "purchased" && ing.last_unit_cost !== null && ing.last_cost_at
        ? { cost: ing.last_unit_cost, date: ing.last_cost_at.slice(0, 10) }
        : null;
    const r = dayUnitCost(input.prices.get(ing.id) ?? [], input.day, manual);
    source.set(ing.id, r.source);
    // Mua vào: luôn ghi đè (kể cả null) — không để rơi về giá danh mục của HÔM NAY khi chốt ngày cũ.
    // Bán thành phẩm chưa có mẻ nào có giá: để công thức tự tính từ giá con của ngày.
    if (ing.kind === "purchased" || r.cost !== null) override.set(ing.id, r.cost);
  }

  const ctx: CostContext = {
    ingredients: new Map(input.ingredients.map((i) => [i.id, i])),
    children: input.byParent,
    override,
  };
  const byId = ctx.ingredients;

  const ingredients: ClosedIngredient[] = input.rows
    .filter((r) => byId.has(r.ingredient_id))
    .map(({ ingredient_id, ...r }) => {
      const ing = byId.get(ingredient_id)!;
      const u = unitCost(ingredient_id, ctx);
      return {
        id: ingredient_id,
        name: ing.name,
        base_unit: ing.base_unit,
        kind: ing.kind,
        ...r,
        unit_cost: u.cost,
        cost_source: u.cost === null ? "none" : (source.get(ingredient_id) ?? "none"),
      };
    });

  const items = input.items
    .filter((it) => (input.byItem.get(it.id) ?? []).length > 0)
    .map((it) => {
      const c = portionCost(input.byItem.get(it.id)!, ctx);
      return { menu_item_id: it.id, name: it.name, portion_cost: c.cost, missing: c.missing };
    });

  const options = input.options
    .filter((o) => (input.byOption.get(o.id) ?? []).length > 0)
    .map((o) => ({
      modifier_option_id: o.id,
      name: o.name,
      cost: portionCost(input.byOption.get(o.id)!, ctx).cost,
    }));

  return { version: 1, ingredients, items, options };
}
