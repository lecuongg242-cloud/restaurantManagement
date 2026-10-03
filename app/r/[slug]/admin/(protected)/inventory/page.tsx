import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { IngredientTable, type IngredientRow } from "@/components/admin/inventory/IngredientTable";
import { loadInventory, costContext } from "@/lib/inventory/data";
import { unitCost } from "@/lib/inventory/cost";
import { purchasePrice } from "@/lib/inventory/units";
import { BASE_UNIT_LABEL, pricePerThousand, qtyLabel, type Ingredient } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + "₫";

/** Giá hiển thị theo đơn vị người ở quán quen nhất: đơn vị nhập nếu có, không thì đơn vị gốc. */
function priceLabel(ing: Ingredient, perBase: number | null): string {
  if (perBase === null) return "chưa có giá";
  if (ing.purchase_unit) return `${vnd(purchasePrice(perBase, ing.purchase_factor)!)} / ${ing.purchase_unit}`;
  const unit = BASE_UNIT_LABEL[ing.base_unit];
  // Giá / g thường lẻ (0,15đ) → hiện theo 1.000 đơn vị cho dễ đọc; kg, lít, cái hiện theo 1 đơn vị.
  return pricePerThousand(ing.base_unit) ? `${vnd(perBase * 1000)} / 1.000 ${unit}` : `${vnd(perBase)} / ${unit}`;
}

type OnHandRow = {
  ingredient_id: string;
  on_hand: number;
  opening: number;
  receipts: number;
  batch_in: number;
  batch_out: number;
  waste: number;
  adjust: number;
};

/**
 * Nguyên liệu CHƯA có dòng sổ kho nào → còn khai được "Tồn hiện có" (P26). Có dòng sổ thì chắc chắn có mặt trong tồn lý
 * thuyết (bản chốt mang nó sang mọi ngày sau) với ít nhất một cột khác 0 — chỉ dòng toàn 0 (mới có bán, chưa nhập) mới phải
 * hỏi thêm DB. Server vẫn kiểm lại khi lưu.
 */
async function ingredientsWithoutEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  ids: string[],
  onHand: OnHandRow[]
): Promise<Set<string>> {
  const byId = new Map(onHand.map((r) => [r.ingredient_id, r]));
  const out = new Set(ids.filter((id) => !byId.has(id)));
  const unsure = ids.filter((id) => {
    const r = byId.get(id);
    return r && [r.opening, r.receipts, r.batch_in, r.batch_out, r.waste, r.adjust].every((v) => Number(v) === 0);
  });
  const counts = await Promise.all(
    unsure.map((id) =>
      supabase.from("stock_entries").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("ingredient_id", id)
    )
  );
  unsure.forEach((id, i) => {
    if ((counts[i].count ?? 1) === 0) out.add(id);
  });
  return out;
}

export default async function InventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!; // layout đã guard
  const supabase = await createClient();
  const tenantId = session.tenant.id;
  const [data, onHand] = await Promise.all([
    loadInventory(supabase, tenantId),
    supabase.rpc("inventory_on_hand", { p_tenant: tenantId }),
  ]);
  const ctx = costContext(data);

  const active = data.ingredients.filter((i) => i.active);
  const openingOk = await ingredientsWithoutEntries(supabase, tenantId, active.map((i) => i.id), (onHand.data ?? []) as OnHandRow[]);
  const options = active.map((i) => ({ id: i.id, name: i.name, base_unit: i.base_unit, kind: i.kind }));
  const onHandById = new Map(((onHand.data ?? []) as OnHandRow[]).map((r) => [r.ingredient_id, Number(r.on_hand)]));

  // Đang dùng trước, rồi theo tên (bảng như Sapo / KiotViet — P29).
  const rows: IngredientRow[] = [...data.ingredients]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "vi"))
    .map((ing) => {
      const cost = unitCost(ing.id, ctx);
      const qty = onHandById.get(ing.id);
      return {
        ing,
        price: priceLabel(ing, cost.cost),
        priceMissing: cost.cost === null,
        stock: qty === undefined ? null : qtyLabel(ing, qty),
        stockLow: qty !== undefined && qty <= 0,
        openingAllowed: openingOk.has(ing.id),
        recipe: ing.kind === "prepared" ? { lines: data.byParent.get(ing.id) ?? [], missing: cost.missing } : null,
      };
    });

  return <IngredientTable slug={slug} rows={rows} options={options} />;
}
