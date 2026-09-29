import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReportRange } from "@/lib/billing/report-range";
import { getInventoryReportBlock, type InventoryReportBlock } from "@/lib/inventory/report-server";
import { parseSettings } from "@/lib/tenant/settings";
import { buildPnl, sumPnl, type PnlView } from "./pnl";

export type PnlBlock = { ok: true; view: PnlView; branches: number } | { ok: false; message: string } | null;

type Row = {
  tenant_id: string; gross_sales: number; discount: number; service_charge: number; vat: number; kpi_revenue: number;
  bill_count: number; purchase_cost: number; purchase_count: number; other_income: number; has_recipes: boolean;
};

/**
 * Kết quả kinh doanh (REPORT-20) cho một hoặc nhiều chi nhánh. `null` = người xem không là CHỦ chi nhánh nào trong danh
 * sách (RPC trả 0 dòng — C5). Giá vốn chế độ định lượng lấy từ khối lãi gộp REPORT-13 (`getInventoryReportBlock`) —
 * trang một chi nhánh truyền sẵn khối đã tính (`inventory`) để không tính hai lần.
 */
export async function getPnlBlock(
  tenantIds: string[],
  range: ReportRange,
  inventory?: InventoryReportBlock
): Promise<PnlBlock> {
  try {
    const supabase = await createClient();
    const args = { p_tenants: tenantIds, p_from: range.fromUtc, p_to: range.toUtc };
    const [pnl, exp, tenants] = await Promise.all([
      supabase.rpc("report_pnl", args),
      supabase.rpc("report_pnl_expenses", args),
      supabase.from("tenants").select("id, settings").in("id", tenantIds),
    ]);
    if (pnl.error) throw new Error(pnl.error.message);
    if (exp.error) throw new Error(exp.error.message);
    const rows = (pnl.data ?? []) as Row[];
    if (rows.length === 0) return null;
    const expenses = (exp.data ?? []) as { tenant_id: string; name: string; cost_group: string; amount: number; voucher_count: number }[];
    const settingsOf = new Map((tenants.data ?? []).map((t) => [t.id as string, parseSettings(t.settings)]));

    const views: PnlView[] = [];
    for (const r of rows) {
      let cogs = 0;
      let uncostedQty = 0;
      let provisionalQty = 0;
      if (r.has_recipes) {
        const inv = inventory !== undefined && rows.length === 1 ? inventory : await getInventoryReportBlock(r.tenant_id, range);
        if (inv && !inv.ok) throw new Error(inv.message);
        if (inv?.ok) {
          cogs = Math.round(inv.data.margin.totals.costTotal);
          uncostedQty = inv.data.margin.totals.uncostedQty;
          provisionalQty = inv.data.margin.totals.provisionalQty;
        }
      }
      views.push(
        buildPnl({
          grossSales: Number(r.gross_sales),
          discount: Number(r.discount),
          serviceCharge: Number(r.service_charge),
          vat: Number(r.vat),
          kpiRevenue: Number(r.kpi_revenue),
          billCount: Number(r.bill_count),
          cogsMode: r.has_recipes ? "closing" : "purchase",
          cogs,
          uncostedQty,
          provisionalQty,
          purchaseCost: Number(r.purchase_cost),
          purchaseCount: Number(r.purchase_count),
          expenses: expenses
            .filter((e) => e.tenant_id === r.tenant_id)
            .map((e) => ({ name: e.name, costGroup: e.cost_group, amount: Number(e.amount), count: Number(e.voucher_count) })),
          otherIncome: Number(r.other_income),
          taxes: settingsOf.get(r.tenant_id)?.taxes ?? [],
        })
      );
    }
    return { ok: true, view: views.length === 1 ? views[0] : sumPnl(views), branches: views.length };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Lỗi không xác định." };
  }
}
