import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { getReportData, getComparison, getCancellationData, type ReportData, type ComparisonData, type CancellationData } from "@/lib/billing/reports";
import { resolveRange, previousRange, deltaPct, vnToday } from "@/lib/billing/report-range";
import { formatVnd } from "@/lib/orders/cart";
import { RangePicker } from "@/components/admin/reports/RangePicker";
import { KpiCard } from "@/components/admin/reports/KpiCard";
import { RevenueChart } from "@/components/admin/reports/RevenueChart";
import { ItemStructure } from "@/components/admin/reports/ItemStructure";
import { PaymentBreakdown } from "@/components/admin/reports/PaymentBreakdown";
import { CategoryBreakdown } from "@/components/admin/reports/CategoryBreakdown";
import { PlaceBreakdown } from "@/components/admin/reports/PlaceBreakdown";
import { AreaBreakdown } from "@/components/admin/reports/AreaBreakdown";
import { HourHeatmap } from "@/components/admin/reports/HourHeatmap";
import { CancellationPanel } from "@/components/admin/reports/CancellationPanel";

export const dynamic = "force-dynamic";

/**
 * Dashboard báo cáo dòng tiền (REPORT-01..09). Chỉ manager/owner. Mốc thời gian NGÀY VN.
 * Doanh thu = Σ bill paid (loại vỏ chia đều) — BILL-05; tổng hợp bằng RPC SQL nên đúng ở
 * mọi quy mô, không còn dính trần 1000 dòng của PostgREST (REPORT-04).
 */
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preset?: string; offset?: string; from?: string; to?: string; bucket?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "reports")) redirect(defaultRouteForRole(slug, session.role));

  // Một mốc "bây giờ" duy nhất cho cả kỳ này lẫn kỳ so sánh — tránh lệch khi qua nửa đêm.
  const now = new Date();
  const range = resolveRange(sp, now);
  const prevRange = previousRange(range, now);

  let data: ReportData;
  let prev: ComparisonData;
  let cancellations: CancellationData;
  try {
    [data, prev, cancellations] = await Promise.all([
      getReportData(session.tenant.id, range),
      getComparison(session.tenant.id, prevRange),
      getCancellationData(session.tenant.id, range),
    ]);
  } catch (err) {
    return (
      <ReportShell slug={slug} range={range} now={now}>
        <div className="mt-lg rounded-lg border border-status-late bg-canvas p-lg">
          <p className="text-sm font-medium text-status-late">Không tải được báo cáo.</p>
          <p className="mt-xs text-sm text-steel">
            {err instanceof Error ? err.message : "Lỗi không xác định."} Thử tải lại trang; nếu vẫn lỗi, kiểm tra
            migration <code className="font-mono text-xs">0023_report_rpcs.sql</code> và{" "}
            <code className="font-mono text-xs">0028_cancel_report_rpcs.sql</code> đã chạy chưa.
          </p>
        </div>
      </ReportShell>
    );
  }

  const { summary, series, topItems, categories, channels, areas, payments, hourDow, peakHour, serviceMode } = data;
  const hasData = summary.billCount > 0;

  return (
    <ReportShell slug={slug} range={range} now={now}>
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Doanh thu"
          value={formatVnd(summary.totalRevenue)}
          delta={deltaPct(summary.totalRevenue, prev.summary.totalRevenue)}
          hint={`Kỳ trước: ${formatVnd(prev.summary.totalRevenue)}`}
          accent
        />
        <KpiCard
          label="Số hóa đơn"
          value={String(summary.billCount)}
          delta={deltaPct(summary.billCount, prev.summary.billCount)}
          hint={`Kỳ trước: ${prev.summary.billCount} HĐ`}
        />
        <KpiCard
          label="TB/hóa đơn"
          value={formatVnd(summary.avgPerBill)}
          delta={deltaPct(summary.avgPerBill, prev.summary.avgPerBill)}
          hint={`Kỳ trước: ${formatVnd(prev.summary.avgPerBill)}`}
        />
        <KpiCard
          label="Giờ cao điểm"
          value={peakHour === null ? "—" : `${String(peakHour).padStart(2, "0")}:00`}
          hint={peakHour === null ? undefined : "Khung giờ doanh thu cao nhất kỳ này"}
        />
      </div>

      {!hasData ? (
        <div className="mt-lg grid place-items-center rounded-lg border border-hairline bg-canvas py-xxl text-center">
          <p className="text-sm text-steel">Chưa có hóa đơn đã thanh toán trong kỳ này.</p>
        </div>
      ) : (
        <>
          <Panel title={`Doanh thu theo ${GRAIN_TITLE[range.grain]}`} className="mt-lg">
            <RevenueChart series={series} prevSeries={prev.series} grain={range.grain} />
          </Panel>

          <div className="mt-lg grid grid-cols-1 gap-lg lg:grid-cols-2">
            <Panel title="Cơ cấu theo nhóm món">
              <CategoryBreakdown categories={categories} />
            </Panel>
            <Panel title="Theo nơi phục vụ">
              <PlaceBreakdown channels={channels} serviceMode={serviceMode} />
            </Panel>
            <Panel title="Cơ cấu theo từng món">
              <ItemStructure items={topItems} total={summary.totalRevenue} />
            </Panel>
            <Panel title="Theo phương thức thanh toán">
              <PaymentBreakdown payments={payments} total={summary.totalRevenue} />
            </Panel>
            {/* Quán bán tại quầy không gắn bàn → khối này chỉ có mỗi dòng "Không gắn bàn 100%",
                không nói lên gì. Ẩn hẳn thay vì bắt người xem đọc một ô vô nghĩa. */}
            {areas.some((a) => a.tableName !== "—") && (
              <Panel title="Theo khu vực & bàn">
                <AreaBreakdown areas={areas} />
              </Panel>
            )}
            {range.dayCount >= 7 && (
              <Panel title="Khung giờ cao điểm">
                <HourHeatmap cells={hourDow} />
              </Panel>
            )}
          </div>
        </>
      )}

      <Panel title="Món bị hủy" className="mt-lg">
        <CancellationPanel data={cancellations} prev={prev.cancel} />
      </Panel>
    </ReportShell>
  );
}

const GRAIN_TITLE = { hour: "giờ", day: "ngày", week: "tuần", month: "tháng" } as const;

/** Khung trang (tiêu đề + bộ chọn kỳ) — dùng chung cho cả nhánh lỗi lẫn nhánh có dữ liệu. */
function ReportShell({
  slug,
  range,
  now,
  children,
}: {
  slug: string;
  range: ReturnType<typeof resolveRange>;
  now: Date;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-6xl">
      <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="font-display text-2xl text-ink">Báo cáo dòng tiền</h1>
          <p className="text-sm text-steel">{range.label} · giờ Việt Nam</p>
        </div>
        <RangePicker
          base={`/r/${slug}/admin/reports`}
          preset={range.preset}
          offset={range.offset}
          fromDay={range.fromDay}
          toDay={range.toDay}
          baseFrom={range.input.from ?? range.fromDay}
          baseTo={range.input.to ?? range.toDay}
          canGoNext={range.canGoNext}
          today={vnToday(now)}
        />
      </div>
      {children}
    </div>
  );
}

function Panel({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-lg border border-hairline bg-canvas p-lg shadow-card ${className ?? ""}`}>
      <h2 className="mb-md font-display text-lg text-ink">{title}</h2>
      {children}
    </section>
  );
}
