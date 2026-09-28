import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReportRange } from "@/lib/billing/report-range";
import type { CategorySlice, PaymentSlice, RevenuePoint, RevenueSummary, TopItem } from "@/lib/billing/reports";
import type { PaymentMethod } from "@/lib/billing/types";

/**
 * Báo cáo gộp chuỗi (P15 15-04, BRANCH-05) — gọi các RPC mảng chi nhánh (0064). Cùng hình dạng dữ liệu với báo
 * cáo một chi nhánh để dùng lại các khối hiển thị. RLS lọc chi nhánh người xem không có quyền.
 */
export type SoSanhChiNhanh = {
  tenantId: string;
  revenue: number;
  billCount: number;
  avgPerBill: number;
  prevRevenue: number;
  prevBillCount: number;
  /** P16 16-03 (report_branch_extra, 0068). */
  discountAmount: number;
  cancelledAmount: number;
  tableSessions: number;
};
export type BaoCaoChuoi = {
  summary: RevenueSummary;
  series: RevenuePoint[];
  prevSeries: number[];
  prevSummary: RevenueSummary;
  topItems: TopItem[];
  categories: CategorySlice[];
  payments: PaymentSlice[];
  branches: SoSanhChiNhanh[];
};

type Client = Awaited<ReturnType<typeof createClient>>;

async function rpc<T>(client: Client, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`Báo cáo chuỗi: lỗi khi gọi ${fn} — ${error.message}`);
  return (data ?? []) as T[];
}

function tom(rows: { total_revenue: number; bill_count: number; avg_per_bill: number }[]): RevenueSummary {
  const r = rows[0];
  return { totalRevenue: Number(r?.total_revenue ?? 0), billCount: Number(r?.bill_count ?? 0), avgPerBill: Number(r?.avg_per_bill ?? 0) };
}

function day(range: ReportRange, rows: { bucket_start: string; revenue: number; bill_count: number }[]): RevenuePoint[] {
  const m = new Map(rows.map((r) => [Date.parse(r.bucket_start), r]));
  return range.buckets.map((b) => ({ label: b.label, revenue: Number(m.get(b.ms)?.revenue ?? 0), billCount: Number(m.get(b.ms)?.bill_count ?? 0) }));
}

export async function getBaoCaoChuoi(tenantIds: string[], range: ReportRange, prev: ReportRange): Promise<BaoCaoChuoi> {
  const client = await createClient();
  const a = { p_tenants: tenantIds, p_from: range.fromUtc, p_to: range.toUtc };
  const p = { p_tenants: tenantIds, p_from: prev.fromUtc, p_to: prev.toUtc };
  type Tom = { total_revenue: number; bill_count: number; avg_per_bill: number };
  type Diem = { bucket_start: string; revenue: number; bill_count: number };
  const [s, se, ps, pse, items, cats, pays, br, ex] = await Promise.all([
    rpc<Tom>(client, "report_summary_multi", a),
    rpc<Diem>(client, "report_series_multi", { ...a, p_grain: range.grain }),
    rpc<Tom>(client, "report_summary_multi", p),
    rpc<Diem>(client, "report_series_multi", { ...p, p_grain: prev.grain }),
    rpc<{ name: string; qty: number; revenue: number }>(client, "report_top_items_multi", { ...a, p_limit: 1000 }),
    rpc<{ name: string; qty: number; revenue: number }>(client, "report_by_category_multi", a),
    rpc<{ method: string; amount: number; count: number }>(client, "report_payments_multi", a),
    rpc<{ tenant_id: string; revenue: number; bill_count: number; avg_per_bill: number; prev_revenue: number; prev_bill_count: number }>(
      client,
      "report_by_branch",
      a
    ),
    rpc<{ tenant_id: string; discount_amount: number; cancelled_amount: number; table_sessions: number }>(
      client,
      "report_branch_extra",
      a
    ),
  ]);
  const exTheo = new Map(ex.map((r) => [r.tenant_id, r]));
  const payMap = new Map<PaymentMethod, PaymentSlice>([
    ["cash", { method: "cash", amount: 0, count: 0 }],
    ["transfer", { method: "transfer", amount: 0, count: 0 }],
  ]);
  for (const r of pays) {
    const x = payMap.get(r.method as PaymentMethod);
    if (x) {
      x.amount = Number(r.amount);
      x.count = Number(r.count);
    }
  }
  return {
    summary: tom(s),
    series: day(range, se),
    prevSummary: tom(ps),
    prevSeries: day(prev, pse).map((d) => d.revenue),
    topItems: items.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) })),
    categories: cats.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) })),
    payments: [...payMap.values()],
    branches: br.map((r) => ({
      tenantId: r.tenant_id,
      revenue: Number(r.revenue),
      billCount: Number(r.bill_count),
      avgPerBill: Number(r.avg_per_bill),
      prevRevenue: Number(r.prev_revenue),
      prevBillCount: Number(r.prev_bill_count),
      discountAmount: Number(exTheo.get(r.tenant_id)?.discount_amount ?? 0),
      cancelledAmount: Number(exTheo.get(r.tenant_id)?.cancelled_amount ?? 0),
      tableSessions: Number(exTheo.get(r.tenant_id)?.table_sessions ?? 0),
    })),
  };
}
