/**
 * Kiểu dữ liệu nguyên liệu & định lượng (P10, QD-017). Khớp bảng `ingredients`, `recipe_lines`
 * (migration 0045). Số lượng luôn ở ĐƠN VỊ GỐC; giá luôn là đồng / 1 đơn vị gốc.
 */

export type BaseUnit = "g" | "ml" | "cai";
export type IngredientKind = "purchased" | "prepared";

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = { g: "g", ml: "ml", cai: "cái" };

export type Ingredient = {
  id: string;
  name: string;
  kind: IngredientKind;
  base_unit: BaseUnit;
  /** Đơn vị lúc mua ("kg", "vỉ"…). Null = nhập thẳng theo đơn vị gốc. */
  purchase_unit: string | null;
  /** 1 đơn vị nhập = bao nhiêu đơn vị gốc. */
  purchase_factor: number;
  /** % dùng được sau sơ chế. Chỉ có nghĩa với `purchased`. */
  yield_pct: number;
  must_count: boolean;
  /** Sản lượng 1 mẻ theo công thức (đơn vị gốc). Chỉ `prepared`. */
  batch_output_qty: number | null;
  /** Giá gần nhất, đồng / đơn vị gốc. */
  last_unit_cost: number | null;
  last_cost_at: string | null;
  active: boolean;
};

/** Một dòng định lượng: lượng nguyên liệu (đơn vị gốc) cho 1 phần món / 1 lần chọn option / 1 mẻ. */
export type RecipeLine = { ingredient_id: string; qty: number };

/**
 * PostgREST trả `numeric` dạng chuỗi khi vượt độ chính xác của JS. Ép một chỗ ở đây thay vì rải
 * `Number()` khắp component (cạm bẫy 10-01).
 */
export function toIngredient(row: Record<string, unknown>): Ingredient {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(row.id),
    name: String(row.name),
    kind: row.kind as IngredientKind,
    base_unit: row.base_unit as BaseUnit,
    purchase_unit: (row.purchase_unit as string | null) ?? null,
    purchase_factor: Number(row.purchase_factor ?? 1),
    yield_pct: Number(row.yield_pct ?? 100),
    must_count: Boolean(row.must_count),
    batch_output_qty: num(row.batch_output_qty),
    last_unit_cost: num(row.last_unit_cost),
    last_cost_at: (row.last_cost_at as string | null) ?? null,
    active: row.active !== false,
  };
}
