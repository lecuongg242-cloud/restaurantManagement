import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { IngredientForm } from "@/components/admin/inventory/IngredientForm";
import { RecipeEditor } from "@/components/admin/inventory/RecipeEditor";
import { loadInventory, costContext } from "@/lib/inventory/data";
import { unitCost } from "@/lib/inventory/cost";
import { purchasePrice } from "@/lib/inventory/units";
import { BASE_UNIT_LABEL, type Ingredient } from "@/lib/inventory/types";
import { setIngredientActive } from "./actions";

export const dynamic = "force-dynamic";

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + "₫";

/** Giá hiển thị theo đơn vị người ở quán quen nhất: đơn vị nhập nếu có, không thì đơn vị gốc. */
function priceLabel(ing: Ingredient, perBase: number | null): string {
  if (perBase === null) return "chưa có giá";
  if (ing.purchase_unit) return `${vnd(purchasePrice(perBase, ing.purchase_factor)!)} / ${ing.purchase_unit}`;
  const unit = BASE_UNIT_LABEL[ing.base_unit];
  // Giá / g thường lẻ (0,15đ) → hiện theo 1.000 đơn vị cho dễ đọc.
  return ing.base_unit === "cai" ? `${vnd(perBase)} / ${unit}` : `${vnd(perBase * 1000)} / 1.000 ${unit}`;
}

export default async function InventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!; // layout đã guard
  const supabase = await createClient();
  const data = await loadInventory(supabase, session.tenant.id);
  const ctx = costContext(data);

  const active = data.ingredients.filter((i) => i.active);
  const hidden = data.ingredients.filter((i) => !i.active);
  const options = active.map((i) => ({ id: i.id, name: i.name, base_unit: i.base_unit, kind: i.kind }));

  return (
    <div className="flex flex-col gap-xl">
      <Card>
        <h2 className="font-display text-lg text-ink">Thêm nguyên liệu</h2>
        <div className="mt-md">
          <IngredientForm slug={slug} />
        </div>
      </Card>

      {active.length === 0 && (
        <p className="text-center text-steel">Chưa có nguyên liệu nào. Thêm nguyên liệu đầu tiên ở form phía trên.</p>
      )}

      <ul className="flex flex-col gap-md">
        {active.map((ing) => {
          const cost = unitCost(ing.id, ctx);
          return (
            <li key={ing.id}>
              <Card className="p-md">
                <div className="flex flex-wrap items-baseline justify-between gap-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{ing.name}</span>
                    <span className="ml-sm text-xs text-steel">
                      {ing.kind === "prepared" ? "Bán thành phẩm" : "Mua vào"} · trừ theo{" "}
                      {BASE_UNIT_LABEL[ing.base_unit]}
                      {ing.kind === "purchased" && ing.yield_pct < 100 ? ` · dùng được ${ing.yield_pct}%` : ""}
                      {ing.must_count ? " · cần kiểm" : ""}
                    </span>
                  </div>
                  <span
                    className={`text-sm tabular-nums ${cost.cost === null ? "text-status-late" : "text-ink"}`}
                  >
                    {priceLabel(ing, cost.cost)}
                  </span>
                </div>

                <details className="mt-sm">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-primary">
                    Sửa
                  </summary>
                  <div className="mt-sm">
                    <IngredientForm slug={slug} ingredient={ing} />
                    <form action={setIngredientActive} className="mt-sm flex justify-end">
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={ing.id} />
                      <input type="hidden" name="active" value="false" />
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center rounded-md px-sm text-sm text-status-late hover:bg-surface"
                      >
                        Ẩn nguyên liệu
                      </button>
                    </form>
                  </div>
                </details>

                {ing.kind === "prepared" && (
                  <details className="mt-xs" open={(data.byParent.get(ing.id) ?? []).length === 0}>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-primary">
                      Công thức 1 mẻ ({ing.batch_output_qty?.toLocaleString("vi-VN")} {BASE_UNIT_LABEL[ing.base_unit]})
                    </summary>
                    <div className="mt-sm">
                      <RecipeEditor
                        slug={slug}
                        ownerKind="parent"
                        ownerId={ing.id}
                        lines={data.byParent.get(ing.id) ?? []}
                        options={options}
                        excludeId={ing.id}
                        label={ing.name}
                      />
                      {cost.missing.length > 0 && (
                        <p className="mt-xs text-xs text-status-late">Chưa đủ giá: {cost.missing.join(", ")}</p>
                      )}
                    </div>
                  </details>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {hidden.length > 0 && (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-steel">
            Đã ẩn ({hidden.length})
          </summary>
          <ul className="mt-sm flex flex-col gap-xs">
            {hidden.map((ing) => (
              <li key={ing.id} className="flex items-center justify-between gap-sm text-sm text-steel">
                {ing.name}
                <form action={setIngredientActive}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="id" value={ing.id} />
                  <input type="hidden" name="active" value="true" />
                  <button type="submit" className="min-h-11 rounded-md px-sm text-primary hover:bg-surface">
                    Hiện lại
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
