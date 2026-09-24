import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { ReceiptForm } from "@/components/admin/inventory/ReceiptForm";
import { BatchForm } from "@/components/admin/inventory/BatchForm";
import { loadInventory } from "@/lib/inventory/data";
import { businessDate } from "@/lib/inventory/day";
import { BASE_UNIT_LABEL, type Ingredient } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

/** Tồn hiện theo đơn vị nhập nếu có ("1,25 kg"), kèm đơn vị gốc cho người bếp. */
function qtyLabel(ing: Ingredient, qty: number): string {
  const base = `${fmt(qty)} ${BASE_UNIT_LABEL[ing.base_unit]}`;
  if (!ing.purchase_unit || ing.purchase_factor === 1) return base;
  return `${fmt(qty / ing.purchase_factor)} ${ing.purchase_unit} (${base})`;
}

type OnHandRow = { ingredient_id: string; receipts: number; order_usage: number; on_hand: number };

/** Nhập hôm nay (INV-04) + chế biến mẻ (INV-05) + tồn hiện tại (INV-06). */
export default async function TodayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const today = businessDate();

  const [data, lastDay, onHand] = await Promise.all([
    loadInventory(supabase, tenantId),
    supabase
      .from("stock_entries")
      .select("business_date")
      .eq("tenant_id", tenantId)
      .eq("kind", "receipt")
      .lt("business_date", today)
      .order("business_date", { ascending: false })
      .limit(1),
    supabase.rpc("inventory_on_hand", { p_tenant: tenantId }),
  ]);

  const purchased = data.ingredients.filter((i) => i.active && i.kind === "purchased");
  let prefill: string[] = purchased.map((i) => i.id);
  const prevDay = lastDay.data?.[0]?.business_date as string | undefined;
  if (prevDay) {
    const { data: prev } = await supabase
      .from("stock_entries")
      .select("ingredient_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "receipt")
      .eq("business_date", prevDay);
    const seen = new Set((prev ?? []).map((r) => r.ingredient_id as string));
    prefill = purchased.filter((i) => seen.has(i.id)).map((i) => i.id);
  }

  const ingById = new Map(data.ingredients.map((i) => [i.id, i]));
  const rows = ((onHand.data ?? []) as OnHandRow[])
    .map((r) => ({ ...r, ing: ingById.get(r.ingredient_id)!, on_hand: Number(r.on_hand) }))
    .filter((r) => r.ing)
    .sort((a, b) => a.ing.name.localeCompare(b.ing.name, "vi"));

  if (data.ingredients.length === 0) {
    return <p className="text-center text-steel">Thêm nguyên liệu ở tab &quot;Nguyên liệu&quot; trước.</p>;
  }

  return (
    <div className="flex flex-col gap-xl">
      <Card>
        <h2 className="font-display text-lg text-ink">Nhập nguyên liệu hôm nay</h2>
        <p className="mt-xxs text-sm text-steel">
          {prevDay ? "Đã điền sẵn danh sách của lần nhập gần nhất" : "Danh sách mua vào"} — chỉ cần sửa số.
          Giá không bắt buộc. Nhập nhiều lần trong ngày sẽ cộng dồn.
        </p>
        <div className="mt-md">
          <ReceiptForm
            slug={slug}
            ingredients={purchased.map((i) => ({
              id: i.id, name: i.name, base_unit: i.base_unit, purchase_unit: i.purchase_unit,
            }))}
            prefill={prefill}
          />
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg text-ink">Chế biến</h2>
        <p className="mt-xxs text-sm text-steel">Nấu xong một mẻ thì ghi ở đây: trừ nguyên liệu con, cộng bán thành phẩm.</p>
        <div className="mt-md">
          <BatchForm slug={slug} ingredients={data.ingredients} recipes={Object.fromEntries(data.byParent)} />
        </div>
      </Card>

      <section>
        <h2 className="font-display text-lg text-ink">Tồn hiện tại (ước tính)</h2>
        <p className="mt-xxs text-sm text-steel">= đã nhập + đã chế biến − đã dùng theo đơn. Số âm: nhập thiếu hoặc định lượng khai dư.</p>
        {rows.length === 0 ? (
          <p className="mt-md text-sm text-steel">Chưa có phiếu nhập nào.</p>
        ) : (
          <ul className="mt-md divide-y divide-hairline-soft rounded-lg border border-hairline-soft">
            {rows.map((r) => (
              <li key={r.ingredient_id} className="flex flex-wrap items-baseline justify-between gap-sm px-md py-sm">
                <span className="text-sm text-ink">{r.ing.name}</span>
                <span className={`text-sm tabular-nums ${r.on_hand <= 0 ? "text-status-late" : "text-ink"}`}>
                  {qtyLabel(r.ing, r.on_hand)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
