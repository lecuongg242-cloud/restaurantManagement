import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { RecipeEditor } from "@/components/admin/inventory/RecipeEditor";
import { loadInventory, costContext } from "@/lib/inventory/data";
import { portionCost, foodCostPct, type CostResult } from "@/lib/inventory/cost";

export const dynamic = "force-dynamic";

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + "₫";
const pct = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "%";

type ItemRow = { id: string; name: string; base_price: number; category_id: string; active: boolean };
type OptionRow = { id: string; group_id: string; name: string; price_delta: number };

function CostLine({ r, price, empty }: { r: CostResult; price: number; empty: string }) {
  if (r.cost === null) {
    return (
      <span className={`text-sm ${r.missing.length ? "text-status-late" : "text-muted"}`}>
        {r.missing.length ? `Chưa đủ giá: ${r.missing.join(", ")}` : empty}
      </span>
    );
  }
  const p = foodCostPct(r.cost, price);
  return (
    <span className="text-sm tabular-nums text-ink">
      Giá vốn {vnd(r.cost)}
      {p !== null && <span className="text-steel"> · {pct(p)} giá bán</span>}
    </span>
  );
}

/** Định lượng từng món + từng tùy chọn gắn với món (INV-02). Không nhét vào ItemDialog của thực đơn. */
export default async function RecipesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const supabase = await createClient();

  const [data, cats, items, links, opts] = await Promise.all([
    loadInventory(supabase, tenantId),
    supabase.from("menu_categories").select("id, name").eq("tenant_id", tenantId).order("sort_order"),
    supabase
      .from("menu_items")
      .select("id, name, base_price, category_id, active")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
    supabase.from("menu_item_modifier_groups").select("item_id, group_id").eq("tenant_id", tenantId),
    supabase
      .from("modifier_options")
      .select("id, group_id, name, price_delta")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
  ]);
  const ctx = costContext(data);
  const options = data.ingredients
    .filter((i) => i.active)
    .map((i) => ({ id: i.id, name: i.name, base_unit: i.base_unit, kind: i.kind }));

  const groupsOf = new Map<string, string[]>();
  for (const l of links.data ?? []) {
    groupsOf.set(l.item_id, [...(groupsOf.get(l.item_id) ?? []), l.group_id]);
  }
  const optionsOfGroup = new Map<string, OptionRow[]>();
  for (const o of (opts.data ?? []) as OptionRow[]) {
    optionsOfGroup.set(o.group_id, [...(optionsOfGroup.get(o.group_id) ?? []), o]);
  }
  const allItems = ((items.data ?? []) as ItemRow[]).filter((i) => i.active);

  if (data.ingredients.length === 0) {
    return <p className="text-center text-steel">Thêm nguyên liệu ở tab &quot;Nguyên liệu&quot; trước, rồi quay lại khai định lượng.</p>;
  }

  return (
    <div className="flex flex-col gap-xxl">
      {(cats.data ?? []).map((cat) => {
        const list = allItems.filter((i) => i.category_id === cat.id);
        if (list.length === 0) return null;
        return (
          <section key={cat.id}>
            <h2 className="font-display text-lg text-ink">{cat.name}</h2>
            <ul className="mt-sm flex flex-col gap-md">
              {list.map((it) => {
                const lines = data.byItem.get(it.id) ?? [];
                const cost = portionCost(lines, ctx);
                const itemOptions = (groupsOf.get(it.id) ?? []).flatMap((g) => optionsOfGroup.get(g) ?? []);
                return (
                  <li key={it.id}>
                    <Card className="p-md">
                      <details>
                        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-sm">
                          <span className="font-medium text-ink">
                            {it.name} <span className="text-sm font-normal text-steel">· {vnd(it.base_price)}</span>
                          </span>
                          <CostLine r={cost} price={it.base_price} empty="Chưa khai định lượng" />
                        </summary>
                        <div className="mt-sm flex flex-col gap-lg">
                          <RecipeEditor
                            slug={slug}
                            ownerKind="item"
                            ownerId={it.id}
                            lines={lines}
                            options={options}
                            label={it.name}
                          />
                          {itemOptions.length > 0 && (
                            <div className="flex flex-col gap-md border-t border-hairline-soft pt-md">
                              <p className="text-sm text-steel">
                                Tùy chọn: lượng <strong>cộng thêm</strong> khi khách chọn (thêm trứng, size lớn…)
                              </p>
                              {itemOptions.map((o) => {
                                const oLines = data.byOption.get(o.id) ?? [];
                                return (
                                  <div key={o.id} className="flex flex-col gap-xs">
                                    <div className="flex flex-wrap items-baseline justify-between gap-sm">
                                      <span className="text-sm text-ink">
                                        {o.name}
                                        {o.price_delta > 0 && <span className="text-steel"> · +{vnd(o.price_delta)}</span>}
                                      </span>
                                      <CostLine r={portionCost(oLines, ctx)} price={o.price_delta} empty="Không trừ nguyên liệu" />
                                    </div>
                                    <RecipeEditor
                                      slug={slug}
                                      ownerKind="option"
                                      ownerId={o.id}
                                      lines={oLines}
                                      options={options}
                                      label={`${it.name} — ${o.name}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </details>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
