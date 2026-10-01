import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { BatchForm } from "@/components/admin/inventory/BatchForm";
import { loadInventory } from "@/lib/inventory/data";
import { qtyLabel } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

type OnHandRow = { ingredient_id: string; on_hand: number };

/**
 * Tồn kho (INV-06) + chế biến mẻ (INV-05). P25 (INV-12): tách khỏi tab "Nhập hôm nay" — nhập hàng chỉ còn ở menu
 * "Nhập hàng", như KiotViet (Hàng hóa ≠ Nhập hàng).
 */
export default async function StockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const supabase = await createClient();

  const [data, onHand] = await Promise.all([
    loadInventory(supabase, tenantId),
    supabase.rpc("inventory_on_hand", { p_tenant: tenantId }),
  ]);

  if (data.ingredients.length === 0) {
    return <p className="text-center text-steel">Thêm nguyên liệu ở tab &quot;Nguyên liệu&quot; trước.</p>;
  }

  const ingById = new Map(data.ingredients.map((i) => [i.id, i]));
  const rows = ((onHand.data ?? []) as OnHandRow[])
    .map((r) => ({ ...r, ing: ingById.get(r.ingredient_id)!, on_hand: Number(r.on_hand) }))
    .filter((r) => r.ing)
    .sort((a, b) => a.ing.name.localeCompare(b.ing.name, "vi"));

  return (
    <div className="flex flex-col gap-xl">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-sm">
          <h2 className="font-display text-lg text-ink">Tồn hiện tại (ước tính)</h2>
          <Link href={`/r/${slug}/admin/nhap-hang/moi`} className="text-sm text-primary">
            + Nhập hàng
          </Link>
        </div>
        <p className="mt-xxs text-sm text-steel">
          = tồn đầu ngày + đã nhập + chế biến ra − chế biến dùng − xuất hủy − đã dùng theo đơn, ± lệch kiểm kê. Số âm: nhập
          thiếu hoặc định lượng khai dư.
        </p>
        {rows.length === 0 ? (
          <p className="mt-md text-sm text-steel">Chưa có phiếu nhập nào.</p>
        ) : (
          <ul className="mt-md divide-y divide-hairline-soft rounded-lg border border-hairline-soft" data-ton-kho>
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

      <Card>
        <h2 className="font-display text-lg text-ink">Chế biến</h2>
        <p className="mt-xxs text-sm text-steel">Nấu xong một mẻ thì ghi ở đây: trừ nguyên liệu con, cộng bán thành phẩm.</p>
        <div className="mt-md">
          <BatchForm slug={slug} ingredients={data.ingredients} recipes={Object.fromEntries(data.byParent)} />
        </div>
      </Card>
    </div>
  );
}
