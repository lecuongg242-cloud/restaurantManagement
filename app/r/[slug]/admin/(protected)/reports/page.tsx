import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { computeVnRange, getReportData, type Bucket } from "@/lib/billing/reports";
import { formatVnd } from "@/lib/orders/cart";
import { RangePicker } from "@/components/admin/reports/RangePicker";
import { RevenueChart } from "@/components/admin/reports/RevenueChart";
import { TopItemsTable } from "@/components/admin/reports/TopItemsTable";
import { PaymentBreakdown } from "@/components/admin/reports/PaymentBreakdown";

export const dynamic = "force-dynamic";

/**
 * Dashboard báo cáo (04-05) — doanh thu ngày/tuần/tháng + món bán chạy + theo phương thức TT.
 * Chỉ manager/owner. Mốc thời gian NGÀY VN. Doanh thu = Σ bill paid (loại vỏ chia đều) — BILL-05.
 */
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ bucket?: string; offset?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "reports")) redirect(defaultRouteForRole(slug, session.role));

  const bucket: Bucket = sp.bucket === "day" ? "day" : sp.bucket === "week" ? "week" : "month";
  const offset = Number.isFinite(Number(sp.offset)) ? Math.trunc(Number(sp.offset)) : 0;

  const range = computeVnRange(bucket, offset);
  const { summary, series, topItems, payments } = await getReportData(session.tenant.id, range);
  const hasData = summary.billCount > 0;

  return (
    <div className="w-full max-w-5xl">
      <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="font-display text-2xl text-ink">Báo cáo dòng tiền</h1>
          <p className="text-sm text-steel">{range.label} · giờ Việt Nam</p>
        </div>
        <RangePicker base={`/r/${slug}/admin/reports`} bucket={bucket} offset={offset} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
        <Kpi label="Doanh thu" value={formatVnd(summary.totalRevenue)} accent />
        <Kpi label="Số hóa đơn" value={String(summary.billCount)} />
        <Kpi label="TB/hóa đơn" value={formatVnd(summary.avgPerBill)} />
      </div>

      {!hasData ? (
        <div className="mt-lg grid place-items-center rounded-lg border border-hairline bg-canvas py-2xl text-center">
          <p className="text-sm text-steel">Chưa có hóa đơn đã thanh toán trong kỳ này.</p>
        </div>
      ) : (
        <>
          <section className="mt-lg rounded-lg border border-hairline bg-canvas p-lg shadow-card">
            <h2 className="mb-md font-display text-lg text-ink">Doanh thu theo ngày</h2>
            <RevenueChart series={series} />
          </section>

          <div className="mt-lg grid grid-cols-1 gap-lg lg:grid-cols-2">
            <section className="rounded-lg border border-hairline bg-canvas p-lg shadow-card">
              <h2 className="mb-md font-display text-lg text-ink">Món bán chạy</h2>
              <TopItemsTable items={topItems} />
            </section>
            <section className="rounded-lg border border-hairline bg-canvas p-lg shadow-card">
              <h2 className="mb-md font-display text-lg text-ink">Theo phương thức thanh toán</h2>
              <PaymentBreakdown payments={payments} total={summary.totalRevenue} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg shadow-card">
      <p className="text-sm text-steel">{label}</p>
      <p className={"mt-xs font-display text-2xl font-semibold tabular-nums " + (accent ? "text-primary" : "text-ink")}>
        {value}
      </p>
    </div>
  );
}
