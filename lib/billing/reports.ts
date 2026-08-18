/**
 * Tổng hợp báo cáo dòng tiền (REPORT-01..09). Chạy SERVER dưới phiên admin ⇒ RLS cách ly tenant.
 *
 * Toàn bộ SUM/GROUP BY nằm trong Postgres (`0023_report_rpcs.sql`). Bản trước fetch từng dòng
 * `bills` rồi cộng trong JS nên dính trần 1000 dòng của PostgREST — tenant đông khách bị báo
 * thiếu doanh thu (REPORT-04). Ở đây chỉ còn việc điền mốc trống và định dạng.
 *
 * Quy ước doanh thu giữ nguyên BILL-05: bill 'paid' + `split_count IS NULL` (loại "vỏ" chia đều).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "./types";
import type { ReportRange } from "./report-range";
import type { AfterPrintSummary } from "./after-print";
import { parseSettings, type ServiceMode } from "@/lib/tenant/settings";

export type { Grain, Preset, ReportRange } from "./report-range";

export type RevenueSummary = { totalRevenue: number; billCount: number; avgPerBill: number };
export type RevenuePoint = { label: string; revenue: number; billCount: number };
export type TopItem = { name: string; qty: number; revenue: number };
export type CategorySlice = { name: string; qty: number; revenue: number };
export type ChannelSlice = {
  channel: OrderChannel;
  source: OrderSource;
  /** Đơn có gắn bàn hay không — cần để dán đúng nhãn nơi phục vụ ở quán chế độ quầy. */
  hasTable: boolean;
  revenue: number;
  itemCount: number;
};
export type AreaSlice = { areaName: string; tableName: string; revenue: number; billCount: number };
export type PaymentSlice = { method: PaymentMethod; amount: number; count: number };
export type HourCell = { dow: number; hour: number; revenue: number; billCount: number };

export type CancelSummary = { cancelledQty: number; cancelledAmount: number; orderedQty: number };
export type CancelActorSlice = {
  membershipId: string | null;
  name: string;
  role: string;
  cnt: number;
  qty: number;
  amount: number;
  /** Phần của người này rơi vào nhóm "hủy sau khi đã in phiếu bếp" (REPORT-11). */
  afterQty: number;
  afterAmount: number;
};
export type CancelItemSlice = { name: string; qty: number; amount: number };
export type CancelRow = {
  cancelledAt: string;
  place: string;
  itemName: string;
  qty: number;
  amount: number;
  reason: string;
  actorName: string;
  /** Mốc in phiếu bếp SỚM NHẤT của đơn chứa món này; null = đơn chưa in lần nào. */
  printedAt: string | null;
  /** Hủy sau mốc đó; null khi chưa in hoặc mốc giờ hủy không đáng tin. */
  afterPrint: boolean | null;
  /** Mốc giờ hủy chỉ là ước lượng (dòng backfill của 0028). */
  timeApprox: boolean;
};

/**
 * Đơn thỏa CẢ BA: đã in phiếu bếp · bị hủy toàn bộ · không có dòng `payments` nào (REPORT-11).
 *
 * Hàm SQL trả cả `printedAt` lẫn `cancelledAt` và KHÔNG lọc theo thứ tự hai mốc — người xem tự
 * nhìn. Kèm `timeApprox` để không ai đọc mốc ước lượng của dữ liệu cũ như mốc thật.
 */
export type CancelSignatureRow = {
  orderId: string;
  cancelledAt: string;
  printedAt: string | null;
  place: string;
  qty: number;
  amount: number;
  reason: string;
  actorName: string;
  actorRole: string;
  timeApprox: boolean;
};

export type DiscountActorSlice = {
  membershipId: string | null;
  name: string;
  role: string;
  cnt: number;
  amount: number;
};
/** Khối "Giảm giá" (REPORT-12): ai duyệt · số lượt · tổng tiền giảm. */
export type DiscountData = { billCnt: number; amount: number; actors: DiscountActorSlice[] };

export type CancellationData = {
  summary: CancelSummary;
  afterPrint: AfterPrintSummary;
  signature: CancelSignatureRow[];
  actors: CancelActorSlice[];
  items: CancelItemSlice[];
  rows: CancelRow[];
  /** Còn dòng phía sau `rows` → màn hình hiện nút "Tải thêm". */
  hasMore: boolean;
};

export type OrderChannel = "dine_in" | "takeaway" | "delivery";
export type OrderSource = "qr" | "staff";

export type ReportData = {
  summary: RevenueSummary;
  series: RevenuePoint[];
  topItems: TopItem[];
  categories: CategorySlice[];
  channels: ChannelSlice[];
  areas: AreaSlice[];
  payments: PaymentSlice[];
  hourDow: HourCell[];
  /** Giờ VN có doanh thu cao nhất trong kỳ; null khi kỳ chưa có hóa đơn. */
  peakHour: number | null;
  /** Chế độ phục vụ của quán — quyết định đơn không bàn là "Tại quán" hay "Mang về". */
  serviceMode: ServiceMode;
};

export type ComparisonData = { summary: RevenueSummary; series: number[] };

/**
 * Khối "Món bị hủy" của dashboard, GỘP kỳ này + kỳ trước và TỰ NUỐT lỗi của riêng nó.
 *
 * REPORT-01..09 đã phát hành trước REPORT-10. Để chung một try/catch với `getReportData` thì một
 * RPC hủy chưa áp lên production (hoặc sau này bị đổi tên) sẽ tắt ngóm cả dashboard sau một hộp
 * báo lỗi. Khối mới hỏng thì chỉ khối mới hiện lỗi.
 */
export type CancellationBlock =
  | { ok: true; data: CancellationData; prev: CancelSummary; discounts: DiscountData }
  | { ok: false; message: string };

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Gọi RPC và NÉM khi lỗi. Bản cũ dùng `const { data } = await ...` nên lỗi DB âm thầm
 * biến thành doanh thu 0 — sai còn tệ hơn báo lỗi.
 */
async function rpc<T>(client: Client, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`Báo cáo: lỗi khi gọi ${fn} — ${error.message}`);
  return (data ?? []) as T[];
}

const EMPTY_SUMMARY: RevenueSummary = { totalRevenue: 0, billCount: 0, avgPerBill: 0 };

function toSummary(rows: { total_revenue: number; bill_count: number; avg_per_bill: number }[]): RevenueSummary {
  const r = rows[0];
  if (!r) return EMPTY_SUMMARY;
  return {
    totalRevenue: Number(r.total_revenue),
    billCount: Number(r.bill_count),
    avgPerBill: Number(r.avg_per_bill),
  };
}

/** Đổ kết quả RPC vào đúng mốc của `range.buckets` — mốc không có hóa đơn giữ giá trị 0. */
function fillSeries(
  range: ReportRange,
  rows: { bucket_start: string; revenue: number; bill_count: number }[]
): RevenuePoint[] {
  const byMs = new Map<number, { revenue: number; billCount: number }>();
  for (const r of rows) {
    byMs.set(Date.parse(r.bucket_start), { revenue: Number(r.revenue), billCount: Number(r.bill_count) });
  }
  return range.buckets.map((b) => ({
    label: b.label,
    revenue: byMs.get(b.ms)?.revenue ?? 0,
    billCount: byMs.get(b.ms)?.billCount ?? 0,
  }));
}

function baseArgs(tenantId: string, range: ReportRange) {
  return { p_tenant: tenantId, p_from: range.fromUtc, p_to: range.toUtc };
}

export async function getReportData(tenantId: string, range: ReportRange): Promise<ReportData> {
  const client = await createClient();
  const args = baseArgs(tenantId, range);

  const [summaryRows, seriesRows, itemRows, catRows, chanRows, areaRows, payRows, hourRows, tenantRow] =
    await Promise.all([
      rpc<{ total_revenue: number; bill_count: number; avg_per_bill: number }>(client, "report_summary", args),
      rpc<{ bucket_start: string; revenue: number; bill_count: number }>(client, "report_series", {
        ...args,
        p_grain: range.grain,
      }),
      // Lấy TẤT CẢ món (không phải top 10) — khối "Cơ cấu theo từng món" cần đủ để tính tỷ trọng.
      rpc<{ name: string; qty: number; revenue: number }>(client, "report_top_items", { ...args, p_limit: 1000 }),
      rpc<{ name: string; qty: number; revenue: number }>(client, "report_by_category", args),
      rpc<{ channel: string; source: string; has_table: boolean; revenue: number; item_count: number }>(
        client,
        "report_by_channel",
        args
      ),
      rpc<{ area_name: string; table_name: string; revenue: number; bill_count: number }>(client, "report_by_area", args),
      rpc<{ method: string; amount: number; count: number }>(client, "report_payments", args),
      rpc<{ dow: number; hour: number; revenue: number; bill_count: number }>(client, "report_hour_dow", args),
      client.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
    ]);

  const hourDow: HourCell[] = hourRows.map((r) => ({
    dow: Number(r.dow),
    hour: Number(r.hour),
    revenue: Number(r.revenue),
    billCount: Number(r.bill_count),
  }));

  // Giờ cao điểm = giờ có tổng doanh thu lớn nhất (cộng dồn mọi thứ trong kỳ).
  const byHour = new Map<number, number>();
  for (const c of hourDow) byHour.set(c.hour, (byHour.get(c.hour) ?? 0) + c.revenue);
  let peakHour: number | null = null;
  let peakRevenue = 0;
  for (const [hour, revenue] of byHour) {
    if (revenue > peakRevenue) {
      peakRevenue = revenue;
      peakHour = hour;
    }
  }

  // payments: luôn hiện đủ 2 phương thức để đối soát, kể cả khi kỳ không có giao dịch loại đó.
  const payMap = new Map<PaymentMethod, PaymentSlice>([
    ["cash", { method: "cash", amount: 0, count: 0 }],
    ["transfer", { method: "transfer", amount: 0, count: 0 }],
  ]);
  for (const p of payRows) {
    const slice = payMap.get(p.method as PaymentMethod);
    if (slice) {
      slice.amount = Number(p.amount);
      slice.count = Number(p.count);
    }
  }

  return {
    summary: toSummary(summaryRows),
    series: fillSeries(range, seriesRows),
    topItems: itemRows.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) })),
    categories: catRows.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) })),
    channels: chanRows.map((r) => ({
      channel: r.channel as OrderChannel,
      source: r.source as OrderSource,
      hasTable: !!r.has_table,
      revenue: Number(r.revenue),
      itemCount: Number(r.item_count),
    })),
    areas: areaRows.map((r) => ({
      areaName: r.area_name,
      tableName: r.table_name,
      revenue: Number(r.revenue),
      billCount: Number(r.bill_count),
    })),
    payments: [...payMap.values()],
    hourDow,
    peakHour,
    serviceMode: parseSettings(tenantRow.data?.settings).service_mode,
  };
}

/** Số dòng chi tiết mỗi lần tải. */
export const CANCEL_PAGE = 20;

const EMPTY_CANCEL: CancelSummary = { cancelledQty: 0, cancelledAmount: 0, orderedQty: 0 };

type CancelSummaryRow = { cancelled_qty: number; cancelled_amount: number; ordered_qty: number };

function toCancelSummary(rows: CancelSummaryRow[]): CancelSummary {
  const r = rows[0];
  if (!r) return EMPTY_CANCEL;
  return {
    cancelledQty: Number(r.cancelled_qty),
    cancelledAmount: Number(r.cancelled_amount),
    orderedQty: Number(r.ordered_qty),
  };
}

type AfterPrintRow = {
  after_qty: number;
  after_amount: number;
  comparable_qty: number;
  comparable_amount: number;
  approx_qty: number;
};

const EMPTY_AFTER_PRINT: AfterPrintSummary = {
  afterQty: 0,
  afterAmount: 0,
  comparableQty: 0,
  comparableAmount: 0,
  approxQty: 0,
};

function toAfterPrint(rows: AfterPrintRow[]): AfterPrintSummary {
  const r = rows[0];
  if (!r) return EMPTY_AFTER_PRINT;
  return {
    afterQty: Number(r.after_qty),
    afterAmount: Number(r.after_amount),
    comparableQty: Number(r.comparable_qty),
    comparableAmount: Number(r.comparable_amount),
    approxQty: Number(r.approx_qty),
  };
}

type SignatureRow = {
  order_id: string;
  cancelled_at: string;
  printed_at: string | null;
  place: string;
  qty: number;
  amount: number;
  reason: string;
  actor_name: string;
  actor_role: string;
  time_approx: boolean;
};

/**
 * Thống kê món bị hủy trong kỳ (REPORT-10). Gồm CẢ dine-in lẫn mang về — lịch sử POS chỉ có
 * takeaway nên đây là chỗ duy nhất xem lại được đơn tại bàn bị hủy.
 */
export async function getCancellationData(
  tenantId: string,
  range: ReportRange,
  opts: { offset?: number } = {}
): Promise<CancellationData> {
  const client = await createClient();
  const args = baseArgs(tenantId, range);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [summaryRows, afterRows, signatureRows, actorRows, itemRows, listRows] = await Promise.all([
    rpc<CancelSummaryRow>(client, "report_cancel_summary", args),
    rpc<AfterPrintRow>(client, "report_cancel_after_print_summary", args),
    // Khối này chủ quán nhìn đầu tiên; 20 đơn là đủ để soi một kỳ, hơn nữa thì thu hẹp kỳ lại.
    rpc<SignatureRow>(client, "report_cancel_full_signature", { ...args, p_limit: 20 }),
    rpc<{
      membership_id: string | null;
      display_name: string;
      role: string;
      cnt: number;
      qty: number;
      amount: number;
      after_qty: number;
      after_amount: number;
    }>(client, "report_cancel_by_actor", args),
    rpc<{ name: string; qty: number; amount: number }>(client, "report_cancel_top_items", {
      ...args,
      p_limit: 10,
    }),
    // Lấy dư 1 dòng để biết còn trang sau mà không cần thêm truy vấn đếm.
    rpc<{
      cancelled_at: string;
      place: string;
      item_name: string;
      qty: number;
      amount: number;
      reason: string;
      actor_name: string;
      printed_at: string | null;
      after_print: boolean | null;
      time_approx: boolean;
    }>(client, "report_cancel_list", { ...args, p_limit: CANCEL_PAGE + 1, p_offset: offset }),
  ]);

  const hasMore = listRows.length > CANCEL_PAGE;

  return {
    summary: toCancelSummary(summaryRows),
    afterPrint: toAfterPrint(afterRows),
    signature: signatureRows.map((r) => ({
      orderId: r.order_id,
      cancelledAt: r.cancelled_at,
      printedAt: r.printed_at,
      place: r.place,
      qty: Number(r.qty),
      amount: Number(r.amount),
      reason: r.reason,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      timeApprox: !!r.time_approx,
    })),
    actors: actorRows.map((r) => ({
      membershipId: r.membership_id,
      name: r.display_name,
      role: r.role,
      cnt: Number(r.cnt),
      qty: Number(r.qty),
      amount: Number(r.amount),
      afterQty: Number(r.after_qty),
      afterAmount: Number(r.after_amount),
    })),
    items: itemRows.map((r) => ({ name: r.name, qty: Number(r.qty), amount: Number(r.amount) })),
    rows: (hasMore ? listRows.slice(0, CANCEL_PAGE) : listRows).map((r) => ({
      cancelledAt: r.cancelled_at,
      place: r.place,
      itemName: r.item_name,
      qty: Number(r.qty),
      amount: Number(r.amount),
      reason: r.reason,
      actorName: r.actor_name,
      printedAt: r.printed_at,
      // `after_print` là boolean BA TRẠNG THÁI ở SQL (true/false/null) — ép về !!r sẽ nuốt mất
      // "chưa kết luận được" thành "hủy trước khi in".
      afterPrint: r.after_print === null ? null : !!r.after_print,
      timeApprox: !!r.time_approx,
    })),
    hasMore,
  };
}

/** Khối "Giảm giá" của kỳ (REPORT-12). Cùng khuôn RPC như phần hủy. */
async function getDiscountData(tenantId: string, range: ReportRange): Promise<DiscountData> {
  const client = await createClient();
  const args = baseArgs(tenantId, range);

  const [summaryRows, actorRows] = await Promise.all([
    rpc<{ bill_cnt: number; discount_amount: number }>(client, "report_discount_summary", args),
    rpc<{ membership_id: string | null; display_name: string; role: string; cnt: number; amount: number }>(
      client,
      "report_discount_by_actor",
      args
    ),
  ]);

  return {
    billCnt: Number(summaryRows[0]?.bill_cnt ?? 0),
    amount: Number(summaryRows[0]?.discount_amount ?? 0),
    actors: actorRows.map((r) => ({
      membershipId: r.membership_id,
      name: r.display_name,
      role: r.role,
      cnt: Number(r.cnt),
      amount: Number(r.amount),
    })),
  };
}

/** Tổng quan hủy của MỘT kỳ — dùng cho kỳ trước (delta tỷ lệ hủy). */
async function getCancelSummary(tenantId: string, range: ReportRange): Promise<CancelSummary> {
  const client = await createClient();
  const rows = await rpc<CancelSummaryRow>(client, "report_cancel_summary", baseArgs(tenantId, range));
  return toCancelSummary(rows);
}

/**
 * Cả khối "Món bị hủy" + "Giảm giá" trong MỘT lời gọi không bao giờ ném. Xem `CancellationBlock`:
 * RPC của REPORT-10/11/12 phải không kéo đổ được REPORT-01..09. Gộp chung một lời gọi vì cả hai
 * khối cùng nằm sau migration 0037 — 0037 chưa áp thì hai khối cùng hiện lỗi, phần còn lại của
 * báo cáo vẫn chạy.
 */
export async function getCancellationBlock(
  tenantId: string,
  range: ReportRange,
  prevRange: ReportRange
): Promise<CancellationBlock> {
  try {
    const [data, prev, discounts] = await Promise.all([
      getCancellationData(tenantId, range),
      getCancelSummary(tenantId, prevRange),
      getDiscountData(tenantId, range),
    ]);
    return { ok: true, data, prev, discounts };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi không xác định." };
  }
}

/**
 * Số liệu kỳ liền trước để tính biến động (REPORT-07). Chỉ lấy tổng quan + chuỗi doanh thu —
 * đủ cho delta KPI và cột mờ chồng sau biểu đồ. Phần hủy của kỳ trước nằm ở
 * `getCancellationBlock` để không kéo dashboard đổ theo.
 */
export async function getComparison(tenantId: string, prevRange: ReportRange): Promise<ComparisonData> {
  const client = await createClient();
  const args = baseArgs(tenantId, prevRange);

  const [summaryRows, seriesRows] = await Promise.all([
    rpc<{ total_revenue: number; bill_count: number; avg_per_bill: number }>(client, "report_summary", args),
    rpc<{ bucket_start: string; revenue: number; bill_count: number }>(client, "report_series", {
      ...args,
      p_grain: prevRange.grain,
    }),
  ]);

  return {
    summary: toSummary(summaryRows),
    series: fillSeries(prevRange, seriesRows).map((p) => p.revenue),
  };
}
