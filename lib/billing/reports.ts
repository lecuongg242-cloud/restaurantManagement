/**
 * Tổng hợp báo cáo dòng tiền (04-05, REPORT-01..03, BILL-05). Chạy SERVER phiên admin RLS (cách
 * ly tenant). Mốc thời gian theo NGÀY VIỆT NAM (UTC+7). Doanh thu = bills.status='paid' AND
 * split_count IS NULL (loại "vỏ" chia đều, đếm phần con — khớp 100% với tiền đã thu).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "./types";

const VN_OFFSET = 7 * 3600 * 1000;

export type Bucket = "day" | "week" | "month";

export type ReportRange = { fromUtc: string; toUtc: string; days: string[]; label: string };
export type RevenueSummary = { totalRevenue: number; billCount: number; avgPerBill: number };
export type RevenuePoint = { date: string; label: string; revenue: number; billCount: number };
export type TopItem = { name: string; qty: number; revenue: number };
export type PaymentSlice = { method: PaymentMethod; amount: number; count: number };
export type ReportData = {
  summary: RevenueSummary;
  series: RevenuePoint[];
  topItems: TopItem[];
  payments: PaymentSlice[];
};

/** VN date string (YYYY-MM-DD) của 1 mốc UTC. */
function vnDate(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET).toISOString().slice(0, 10);
}

/** dd/mm từ YYYY-MM-DD. */
function ddmm(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/**
 * Khoảng thời gian theo ngày VN cho bucket + offset (0 = kỳ hiện tại, −1 = kỳ trước…).
 * Trả mốc UTC [from,to) + danh sách ngày VN + nhãn kỳ. Dùng `new Date()` (server component OK).
 */
export function computeVnRange(bucket: Bucket, offset: number): ReportRange {
  const now = new Date();
  const vn = new Date(now.getTime() + VN_OFFSET);
  const y = vn.getUTCFullYear();
  const mo = vn.getUTCMonth();
  const d = vn.getUTCDate();
  const DAY = 86400000;

  let startVn: number;
  let endVn: number;
  let label: string;

  if (bucket === "day") {
    startVn = Date.UTC(y, mo, d) + offset * DAY;
    endVn = startVn + DAY;
    label = ddmm(new Date(startVn).toISOString().slice(0, 10)) + "/" + new Date(startVn).getUTCFullYear();
  } else if (bucket === "week") {
    const dow = new Date(Date.UTC(y, mo, d)).getUTCDay(); // 0=CN..6=T7
    const toMonday = dow === 0 ? -6 : 1 - dow;
    startVn = Date.UTC(y, mo, d) + toMonday * DAY + offset * 7 * DAY;
    endVn = startVn + 7 * DAY;
    label = `Tuần ${ddmm(new Date(startVn).toISOString().slice(0, 10))}–${ddmm(new Date(endVn - DAY).toISOString().slice(0, 10))}`;
  } else {
    startVn = Date.UTC(y, mo + offset, 1);
    endVn = Date.UTC(y, mo + offset + 1, 1);
    label = `Tháng ${new Date(startVn).getUTCMonth() + 1}/${new Date(startVn).getUTCFullYear()}`;
  }

  const days: string[] = [];
  for (let e = startVn; e < endVn; e += DAY) days.push(new Date(e).toISOString().slice(0, 10));

  return {
    fromUtc: new Date(startVn - VN_OFFSET).toISOString(),
    toUtc: new Date(endVn - VN_OFFSET).toISOString(),
    days,
    label,
  };
}

export async function getReportData(tenantId: string, range: ReportRange): Promise<ReportData> {
  const client = await createClient();

  // Doanh thu: bill 'paid', loại vỏ chia đều (split_count null).
  const { data: bills } = await client
    .from("bills")
    .select("total, paid_at")
    .eq("tenant_id", tenantId)
    .eq("status", "paid")
    .is("split_count", null)
    .gte("paid_at", range.fromUtc)
    .lt("paid_at", range.toUtc);

  const totalRevenue = (bills ?? []).reduce((s, b) => s + (b.total as number), 0);
  const billCount = (bills ?? []).length;
  const summary: RevenueSummary = {
    totalRevenue,
    billCount,
    avgPerBill: billCount > 0 ? Math.round(totalRevenue / billCount) : 0,
  };

  // Series theo ngày VN.
  const byDay = new Map<string, { revenue: number; billCount: number }>();
  for (const b of bills ?? []) {
    const day = vnDate(b.paid_at as string);
    const acc = byDay.get(day) ?? { revenue: 0, billCount: 0 };
    acc.revenue += b.total as number;
    acc.billCount += 1;
    byDay.set(day, acc);
  }
  const series: RevenuePoint[] = range.days.map((day) => ({
    date: day,
    label: ddmm(day),
    revenue: byDay.get(day)?.revenue ?? 0,
    billCount: byDay.get(day)?.billCount ?? 0,
  }));

  // Món bán chạy: bill_items của bill 'paid' (giữ món = normal/gộp/vỏ; con không có món → không đếm trùng).
  const { data: bi } = await client
    .from("bill_items")
    .select("qty_allocated, amount, order_items(name_snapshot), bills!inner(status, paid_at)")
    .eq("tenant_id", tenantId)
    .eq("bills.status", "paid")
    .gte("bills.paid_at", range.fromUtc)
    .lt("bills.paid_at", range.toUtc);

  const itemMap = new Map<string, { qty: number; revenue: number }>();
  for (const r of bi ?? []) {
    const oi = r.order_items as { name_snapshot?: string } | null;
    const name = oi?.name_snapshot ?? "—";
    const acc = itemMap.get(name) ?? { qty: 0, revenue: 0 };
    acc.qty += r.qty_allocated as number;
    acc.revenue += r.amount as number;
    itemMap.set(name, acc);
  }
  const topItems: TopItem[] = [...itemMap.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, 10);

  // Theo phương thức TT: payments trong kỳ (Σ = doanh thu — mỗi bill thu 1 payment, vỏ không thu).
  const { data: pays } = await client
    .from("payments")
    .select("method, amount")
    .eq("tenant_id", tenantId)
    .gte("received_at", range.fromUtc)
    .lt("received_at", range.toUtc);

  const payMap = new Map<PaymentMethod, { amount: number; count: number }>([
    ["cash", { amount: 0, count: 0 }],
    ["transfer", { amount: 0, count: 0 }],
  ]);
  for (const p of pays ?? []) {
    const acc = payMap.get(p.method as PaymentMethod);
    if (acc) {
      acc.amount += p.amount as number;
      acc.count += 1;
    }
  }
  const payments: PaymentSlice[] = [...payMap.entries()].map(([method, v]) => ({ method, amount: v.amount, count: v.count }));

  return { summary, series, topItems, payments };
}
