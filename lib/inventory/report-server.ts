import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReportRange } from "@/lib/billing/report-range";
import { ensureClosedThrough, previewDay } from "./close-server";
import { businessDate } from "./day";
import { mergeMargin, type MarginItem, type MarginRpcRow, type MarginTotals, type OpenLine } from "./margin";
import { rowWaste, suspectRecipe, wasteBreakdown, type WasteRow, type WasteSource, type WasteSummary } from "./waste";

/**
 * Hai khối P10 trên trang Báo cáo: lãi gộp theo món (REPORT-13) + hao hụt (REPORT-14).
 *
 * `null` = quán chưa khai nguyên liệu nào → trang KHÔNG render hai khối (INV-10), không phải render
 * rỗng. Lỗi → trả thông báo để hai khối tự hiện lỗi, các khối cũ của báo cáo không bị kéo theo.
 */
export type WasteIngredient = {
  id: string;
  name: string;
  bySource: Record<WasteSource, number>;
  total: number;
  counted: boolean;
  unpriced: boolean;
  suspect: boolean;
};

export type InventoryReport = {
  margin: { items: MarginItem[]; totals: MarginTotals };
  reconcile: { netItem: number; service: number; vat: number; kpi: number; gap: number };
  waste: WasteSummary & { ingredients: WasteIngredient[]; closedDays: number };
};

export type InventoryReportBlock = { ok: true; data: InventoryReport } | { ok: false; message: string } | null;

export async function getInventoryReportBlock(tenantId: string, range: ReportRange): Promise<InventoryReportBlock> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("ingredients")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (!count) return null;

  try {
    const today = businessDate();
    await ensureClosedThrough(supabase, tenantId, today);
    const args = { p_tenant: tenantId, p_from: range.fromUtc, p_to: range.toUtc };
    const includesToday = range.fromDay <= today && today <= range.toDay;

    const [margin, reconcile, waste, open] = await Promise.all([
      supabase.rpc("report_gross_margin", args),
      supabase.rpc("report_margin_reconcile", args),
      supabase.rpc("report_waste", args),
      includesToday
        ? supabase.rpc("report_margin_open_lines", { ...args, p_day: today })
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [margin, reconcile, waste, open]) if (r.error) throw new Error(r.error.message);

    const openLines = ((open.data ?? []) as OpenLine[]).map((l) => ({
      ...l,
      qty: Number(l.qty),
      net_revenue: Number(l.net_revenue),
    }));
    const preview = openLines.length > 0 ? await previewDay(supabase, tenantId, today) : null;
    const merged = mergeMargin((margin.data ?? []) as MarginRpcRow[], openLines, preview);

    const rec = ((reconcile.data ?? []) as Record<string, number>[])[0] ?? {};
    const netItem = Number(rec.net_item_revenue ?? 0);
    const service = Number(rec.service_charge ?? 0);
    const vat = Number(rec.vat ?? 0);
    const kpi = Number(rec.kpi_revenue ?? 0);

    const wasteRows = ((waste.data ?? []) as Record<string, unknown>[]).map((r) => ({
      business_date: String(r.business_date),
      ingredient_id: String(r.ingredient_id),
      name: String(r.name),
      unit_cost: r.unit_cost === null ? null : Number(r.unit_cost),
      counted: Boolean(r.counted),
      cancel_usage: Number(r.cancel_usage),
      batch_shortfall: Number(r.batch_shortfall),
      waste_hong: Number(r.waste_hong),
      waste_do_bo: Number(r.waste_do_bo),
      waste_com_nv: Number(r.waste_com_nv),
      waste_khac: Number(r.waste_khac),
      adjust: Number(r.adjust),
    }));

    return {
      ok: true,
      data: {
        margin: merged,
        reconcile: { netItem, service, vat, kpi, gap: kpi - (netItem + service + vat) },
        waste: {
          ...wasteBreakdown(wasteRows, merged.totals.netRevenue),
          ingredients: perIngredient(wasteRows),
          closedDays: new Set(wasteRows.map((r) => r.business_date)).size,
        },
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function perIngredient(rows: (WasteRow & { business_date: string })[]): WasteIngredient[] {
  const by = new Map<string, (WasteRow & { business_date: string })[]>();
  for (const r of rows) by.set(r.ingredient_id, [...(by.get(r.ingredient_id) ?? []), r]);

  const out: WasteIngredient[] = [];
  for (const [id, list] of by) {
    const bySource: Record<WasteSource, number> = { cancel: 0, shortfall: 0, waste: 0, unexplained: 0 };
    let unpriced = false;
    for (const r of list) {
      const w = rowWaste(r);
      if (!w) {
        unpriced = true;
        continue;
      }
      for (const k of Object.keys(bySource) as WasteSource[]) bySource[k] += w[k];
    }
    const counted = list.filter((r) => r.counted).sort((a, b) => a.business_date.localeCompare(b.business_date));
    const total = bySource.cancel + bySource.shortfall + bySource.waste + bySource.unexplained;
    out.push({
      id,
      name: list[list.length - 1].name,
      bySource,
      total,
      counted: counted.length > 0,
      unpriced,
      suspect: suspectRecipe(counted.map((r) => -r.adjust)),
    });
  }
  return out.filter((i) => i.total !== 0 || i.suspect || i.unpriced).sort((a, b) => b.total - a.total);
}
