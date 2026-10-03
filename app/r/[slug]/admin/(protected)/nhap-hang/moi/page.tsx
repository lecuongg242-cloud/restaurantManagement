import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { activeSupplierOptions } from "@/lib/purchasing/data";
import { costContext, loadInventory } from "@/lib/inventory/data";
import { getMonDuBao } from "@/lib/forecast/read";
import { canNguyenLieu, goiYNhap, type GoiYNhap } from "@/lib/forecast/ingredients";
import { businessDate } from "@/lib/inventory/day";
import { BASE_UNIT_LABEL, qtyLabel } from "@/lib/inventory/types";
import { Card } from "@/components/ui/card";
import { ReceiptForm } from "@/components/admin/inventory/ReceiptForm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });

type OnHandRow = { ingredient_id: string; on_hand: number };

/**
 * "+ Nhập hàng" — lập phiếu nhập (như KiotViet "+ Nhập hàng"). P25 (INV-12): chỗ nhập hàng DUY NHẤT — tab "Nhập hôm nay"
 * cũ chuyển về đây: nút "Lấy hàng lần trước" (danh sách của ngày nhập gần nhất) và gợi ý nhập theo dự báo (P18, AI-03).
 */
export default async function NewPurchasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const today = businessDate();

  const [data, lastDay, onHand, suppliers] = await Promise.all([
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
    activeSupplierOptions(supabase, tenantId),
  ]);

  const purchased = data.ingredients.filter((i) => i.active && i.kind === "purchased");
  let lastIngredients: string[] = [];
  const prevDay = lastDay.data?.[0]?.business_date as string | undefined;
  if (prevDay) {
    const { data: prev } = await supabase
      .from("stock_entries")
      .select("ingredient_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "receipt")
      .eq("business_date", prevDay);
    const seen = new Set((prev ?? []).map((r) => r.ingredient_id as string));
    lastIngredients = purchased.filter((i) => seen.has(i.id)).map((i) => i.id);
  }

  const ingById = new Map(data.ingredients.map((i) => [i.id, i]));

  // P18 18-02 (AI-03): gợi ý nhập = món dự báo HÔM NAY × định lượng − tồn lý thuyết (+10% dự phòng), làm tròn lên theo
  // đơn vị nhập. Tính lúc mở trang (không phải job đêm) để dùng tồn MỚI NHẤT — sáng nay đã nhập thì gợi ý tự giảm.
  // Chỉ có khi dự báo đáng tin (khối "Dự báo 7 ngày tới" đang hiện).
  const tonMap = new Map(((onHand.data ?? []) as OnHandRow[]).map((r) => [r.ingredient_id, Number(r.on_hand)]));
  const [duHomNay, du3Ngay] = await Promise.all([
    getMonDuBao(tenantId, 1).catch(() => null),
    getMonDuBao(tenantId, 3).catch(() => null),
  ]);
  const ctx = costContext(data);
  const nhuCau = duHomNay ? canNguyenLieu(duHomNay.mon, data.byItem, ctx, tonMap) : null;
  const nhuCau3 = du3Ngay ? canNguyenLieu(du3Ngay.mon, data.byItem, ctx, tonMap) : null;
  const goiY: GoiYNhap[] = nhuCau ? goiYNhap(nhuCau.can, tonMap, ctx, 10) : [];
  const monTen = new Map<string, string>();
  const idMonThieu = (nhuCau?.chuaKhai ?? []).filter((x) => !x.startsWith("ten:"));
  if (idMonThieu.length) {
    const { data: mi } = await supabase.from("menu_items").select("id, name").in("id", idMonThieu);
    for (const r of mi ?? []) monTen.set(r.id as string, r.name as string);
  }

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/nhap-hang`} className="text-sm text-primary">
          ‹ Nhập hàng
        </Link>
        <h2 className="mt-xxs font-display text-xl text-ink">Lập phiếu nhập</h2>
        <p className="mt-xxs text-sm text-steel">
          Nhà cung cấp, giá không bắt buộc. Mỗi lần Hoàn thành là một phiếu nhập; nhập nhiều lần trong ngày sẽ cộng dồn.
        </p>
      </header>
      <Card>
        {purchased.length === 0 ? (
          <p className="text-sm text-steel">
            Chưa có nguyên liệu mua vào nào —{" "}
            <Link href={`/r/${slug}/admin/inventory`} className="text-primary">
              thêm ở Nguyên liệu
            </Link>{" "}
            trước.
          </p>
        ) : (
          <ReceiptForm
            slug={slug}
            ingredients={purchased.map((i) => ({
              id: i.id, name: i.name, base_unit: i.base_unit, purchase_unit: i.purchase_unit,
            }))}
            lastIngredients={lastIngredients}
            goiY={Object.fromEntries(goiY.filter((g) => g.goiY > 0).map((g) => [g.ingredientId, g.goiY]))}
            suppliers={suppliers}
          />
        )}
      </Card>

      {nhuCau && (
        <Card data-goi-y-nhap>
          <h2 className="font-display text-lg text-ink">Gợi ý nhập theo dự báo hôm nay</h2>
          <p className="mt-xxs text-sm text-steel">
            = món dự báo bán hôm nay × định lượng − tồn hiện tại, cộng 10% dự phòng, làm tròn lên theo đơn vị nhập. Bấm
            &quot;Điền theo gợi ý&quot; ở phiếu nhập bên trên để chép số.
          </p>
          {goiY.length === 0 ? (
            <p className="mt-md text-sm text-steel">Chưa có món nào khai định lượng trong dự báo hôm nay.</p>
          ) : (
            <div className="mt-md overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-steel">
                  <tr>
                    <th className="py-xs font-medium">Nguyên liệu</th>
                    <th className="py-xs text-right font-medium">Cần hôm nay</th>
                    <th className="py-xs text-right font-medium">Cần 3 ngày</th>
                    <th className="py-xs text-right font-medium">Tồn</th>
                    <th className="py-xs text-right font-medium">Gợi ý nhập</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {goiY
                    .map((g) => ({ g, ing: ingById.get(g.ingredientId)! }))
                    .sort((a, b) => a.ing.name.localeCompare(b.ing.name, "vi"))
                    .map(({ g, ing }) => (
                      <tr key={g.ingredientId}>
                        <td className="py-xs text-ink">
                          {ing.name}
                          {g.lyDo === "ton-am" && <span className="ml-xs text-xs text-status-late">tồn âm — kiểm kê lại</span>}
                        </td>
                        <td className="py-xs text-right tabular-nums">{qtyLabel(ing, g.can)}</td>
                        <td className="py-xs text-right tabular-nums text-slate">
                          {qtyLabel(ing, nhuCau3?.can.get(g.ingredientId) ?? g.can)}
                        </td>
                        <td className="py-xs text-right tabular-nums text-slate">{qtyLabel(ing, g.ton)}</td>
                        <td className="py-xs text-right font-medium tabular-nums text-ink">
                          {g.goiY > 0 ? `${fmt(g.goiY)} ${ing.purchase_unit ?? BASE_UNIT_LABEL[ing.base_unit]}` : "đủ"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {nhuCau.banThanhPham.some((b) => b.phaiNau > 0) && (
            <p className="mt-sm text-sm text-slate">
              Cần nấu thêm:{" "}
              {nhuCau.banThanhPham
                .filter((b) => b.phaiNau > 0 && ingById.has(b.id))
                .map((b) => `${ingById.get(b.id)!.name} ${qtyLabel(ingById.get(b.id)!, b.phaiNau)}`)
                .join(", ")}
              .
            </p>
          )}
          {nhuCau.chuaKhai.length > 0 && (
            <p className="mt-sm text-sm text-steel">
              Món chưa khai định lượng (không tính vào gợi ý):{" "}
              {nhuCau.chuaKhai.map((k) => monTen.get(k) ?? k.replace(/^ten:/, "")).join(", ")}.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
