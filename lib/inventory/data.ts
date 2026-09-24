import type { SupabaseClient } from "@supabase/supabase-js";
import { toIngredient, type Ingredient, type RecipeLine } from "./types";
import type { CostContext } from "./cost";

/**
 * Đọc toàn bộ nguyên liệu + định lượng của một quán một lần, gom theo chủ. Quy mô một quán là vài
 * chục nguyên liệu, vài trăm dòng định lượng — đọc trọn rẻ hơn nhiều lần truy vấn nhỏ.
 */
export type InventoryData = {
  ingredients: Ingredient[];
  byItem: Map<string, RecipeLine[]>;
  byOption: Map<string, RecipeLine[]>;
  /** Bán thành phẩm → công thức 1 mẻ. */
  byParent: Map<string, RecipeLine[]>;
};

type LineRow = {
  ingredient_id: string;
  qty: number | string;
  menu_item_id: string | null;
  modifier_option_id: string | null;
  parent_ingredient_id: string | null;
};

function push(map: Map<string, RecipeLine[]>, key: string, line: RecipeLine) {
  const arr = map.get(key) ?? [];
  arr.push(line);
  map.set(key, arr);
}

export async function loadInventory(
  supabase: SupabaseClient,
  tenantId: string
): Promise<InventoryData> {
  const [{ data: ing, error: e1 }, { data: lines, error: e2 }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
    supabase
      .from("recipe_lines")
      .select("ingredient_id, qty, menu_item_id, modifier_option_id, parent_ingredient_id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
  ]);
  if (e1) throw new Error(`Đọc nguyên liệu lỗi: ${e1.message}`);
  if (e2) throw new Error(`Đọc định lượng lỗi: ${e2.message}`);

  const byItem = new Map<string, RecipeLine[]>();
  const byOption = new Map<string, RecipeLine[]>();
  const byParent = new Map<string, RecipeLine[]>();
  for (const r of (lines ?? []) as LineRow[]) {
    const line = { ingredient_id: r.ingredient_id, qty: Number(r.qty) };
    if (r.menu_item_id) push(byItem, r.menu_item_id, line);
    else if (r.modifier_option_id) push(byOption, r.modifier_option_id, line);
    else if (r.parent_ingredient_id) push(byParent, r.parent_ingredient_id, line);
  }

  return {
    ingredients: ((ing ?? []) as Record<string, unknown>[]).map(toIngredient),
    byItem,
    byOption,
    byParent,
  };
}

export function costContext(data: InventoryData): CostContext {
  return {
    ingredients: new Map(data.ingredients.map((i) => [i.id, i])),
    children: data.byParent,
  };
}
