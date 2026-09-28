import Link from "next/link";
import type { ChiNhanh } from "@/lib/brand/branches";
import { getBaoCaoChuoi } from "@/lib/brand/reports";
import { getBaoCaoNhanVien } from "@/lib/reports/deep";
import { StaffPanel } from "@/components/admin/reports/StaffPanel";
import { deltaPct, type ReportRange, vnToday } from "@/lib/billing/report-range";
import { formatVnd } from "@/lib/orders/cart";
import { RangePicker } from "@/components/admin/reports/RangePicker";
import { KpiCard } from "@/components/admin/reports/KpiCard";
import { RevenueChart } from "@/components/admin/reports/RevenueChart";
import { ItemStructure } from "@/components/admin/reports/ItemStructure";
import { PaymentBreakdown } from "@/components/admin/reports/PaymentBreakdown";
import { CategoryBreakdown } from "@/components/admin/reports/CategoryBreakdown";
import { cn } from "@/lib/utils";

const GRAIN_TITLE = { hour: "giờ", day: "ngày", week: "tuần", month: "tháng" } as const;

/**
 * Báo cáo chuỗi (P15 15-04, BRANCH-05) — kiểu "Báo cáo theo chi nhánh" của Sapo / lọc theo cửa hàng của iPOS:
 * lọc chi nhánh (mặc định tất cả) + kỳ; KPI, biểu đồ, nhóm món, món bán chạy (món cùng gốc cộng chung),
 * phương thức thanh toán, bảng so sánh chi nhánh. Tham số `cn` = danh sách mã chi nhánh, trống = tất cả.
 */
export async function BaoCaoChuoiView({
  all,
  loc: dangLoc,
  range,
  prev,
  base,
  kyQuery,
  now,
  dauTrang,
}: {
  /** Mọi chi nhánh người xem vào được. */
  all: ChiNhanh[];
  /** Mã chi nhánh đang lọc (phẩy), rỗng = tất cả. */
  loc: string | undefined;
  range: ReportRange;
  prev: ReportRange;
  /** Đường dẫn trang báo cáo, đã kèm `?pham=chuoi`. */
  base: string;
  kyQuery: string;
  now: Date;
  /** Khối đầu trang (tiêu đề + bộ chọn phạm vi) do trang gọi dựng. */
  dauTrang: React.ReactNode;
}) {
  const chon = dangLoc ? new Set(dangLoc.split(",")) : null;
  const dang = chon ? all.filter((b) => chon.has(b.slug)) : all;
  const [d, staff] = await Promise.all([
    getBaoCaoChuoi(dang.map((b) => b.tenantId), range, prev),
    getBaoCaoNhanVien(dang.map((b) => b.tenantId), range).catch(() => null),
  ]);
  const tenTheo = new Map(all.map((b) => [b.tenantId, b]));
  const loc = (c: string | null) => `${base}${[kyQuery, c ? `cn=${c}` : ""].filter(Boolean).map((x) => `&${x}`).join("")}`;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-md">
        {dauTrang}
        <RangePicker
          base={base.split("?")[0]}
          preset={range.preset}
          offset={range.offset}
          fromDay={range.fromDay}
          toDay={range.toDay}
          baseFrom={range.input.from ?? range.fromDay}
          baseTo={range.input.to ?? range.toDay}
          canGoNext={range.canGoNext}
          today={vnToday(now)}
          keep={{ pham: "chuoi", ...(dangLoc ? { cn: dangLoc } : {}) }}
        />
      </div>

      <nav aria-label="Lọc chi nhánh" className="flex flex-wrap items-center gap-xs text-sm">
        <span className="text-steel">Chi nhánh:</span>
        <Link
          href={loc(null)}
          aria-current={!chon ? "page" : undefined}
          className={cn("rounded-full border px-sm py-[2px]", !chon ? "border-ink bg-ink text-canvas" : "border-hairline-strong text-slate")}
        >
          Tất cả
        </Link>
        {all.map((b) => {
          const bat = !chon || chon.has(b.slug);
          const tiep = chon
            ? bat
              ? [...chon].filter((x) => x !== b.slug)
              : [...chon, b.slug]
            : all.filter((x) => x.slug !== b.slug).map((x) => x.slug);
          return (
            <Link
              key={b.slug}
              href={loc(tiep.length && tiep.length < all.length ? tiep.join(",") : null)}
              aria-pressed={bat}
              className={cn("rounded-full border px-sm py-[2px]", bat && chon ? "border-primary bg-cream text-ink" : "border-hairline-strong text-slate")}
            >
              {b.name}
            </Link>
          );
        })}
      </nav>

      <div className="grid gap-md sm:grid-cols-3">
        <KpiCard
          label="Doanh thu"
          value={formatVnd(d.summary.totalRevenue)}
          delta={deltaPct(d.summary.totalRevenue, d.prevSummary.totalRevenue)}
          hint={`Kỳ trước: ${formatVnd(d.prevSummary.totalRevenue)}`}
          accent
        />
        <KpiCard
          label="Số hóa đơn"
          value={String(d.summary.billCount)}
          delta={deltaPct(d.summary.billCount, d.prevSummary.billCount)}
          hint={`Kỳ trước: ${d.prevSummary.billCount} HĐ`}
        />
        <KpiCard
          label="TB/hóa đơn"
          value={formatVnd(d.summary.avgPerBill)}
          delta={deltaPct(d.summary.avgPerBill, d.prevSummary.avgPerBill)}
          hint={`Kỳ trước: ${formatVnd(d.prevSummary.avgPerBill)}`}
        />
      </div>

      <Panel title="So sánh chi nhánh">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm" data-so-sanh-chi-nhanh>
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-xs pr-md font-medium">Chi nhánh</th>
                <th className="py-xs pr-md text-right font-medium">Doanh thu</th>
                <th className="py-xs pr-md text-right font-medium">Tỷ trọng</th>
                <th className="py-xs pr-md text-right font-medium">Hóa đơn</th>
                <th className="py-xs pr-md text-right font-medium">TB/HĐ</th>
                <th className="py-xs pr-md text-right font-medium">Giảm giá</th>
                <th className="py-xs pr-md text-right font-medium">Hủy món</th>
                <th className="py-xs pr-md text-right font-medium">DT / lượt bàn</th>
                <th className="py-xs text-right font-medium">So kỳ trước</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {d.branches.map((r) => {
                const bd = deltaPct(r.revenue, r.prevRevenue);
                return (
                  <tr key={r.tenantId}>
                    <td className="py-xs pr-md text-ink">{tenTheo.get(r.tenantId)?.name ?? "—"}</td>
                    <td className="py-xs pr-md text-right tabular-nums text-ink">{formatVnd(r.revenue)}</td>
                    <td className="py-xs pr-md text-right tabular-nums text-slate">
                      {d.summary.totalRevenue ? `${Math.round((r.revenue / d.summary.totalRevenue) * 100)}%` : "—"}
                    </td>
                    <td className="py-xs pr-md text-right tabular-nums text-slate">{r.billCount}</td>
                    <td className="py-xs pr-md text-right tabular-nums text-slate">{formatVnd(r.avgPerBill)}</td>
                    <td className="py-xs pr-md text-right tabular-nums text-slate">{tyLe(r.discountAmount, r.revenue + r.discountAmount)}</td>
                    <td className="py-xs pr-md text-right tabular-nums text-slate">{tyLe(r.cancelledAmount, r.revenue + r.cancelledAmount)}</td>
                    <td className="py-xs pr-md text-right tabular-nums text-slate">
                      {r.tableSessions ? formatVnd(Math.round(r.revenue / r.tableSessions)) : "—"}
                    </td>
                    <td className={cn("py-xs text-right tabular-nums", bd == null ? "text-steel" : bd >= 0 ? "text-status-ready" : "text-status-late")}>
                      {bd == null ? "—" : `${bd >= 0 ? "+" : ""}${bd}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {d.summary.billCount === 0 ? (
        <div className="grid place-items-center rounded-lg border border-hairline bg-canvas py-xxl text-center">
          <p className="text-sm text-steel">Chưa có hóa đơn đã thanh toán trong kỳ này.</p>
        </div>
      ) : (
        <>
          <Panel title={`Doanh thu theo ${GRAIN_TITLE[range.grain]}`}>
            <RevenueChart series={d.series} prevSeries={d.prevSeries} grain={range.grain} />
          </Panel>
          <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
            <Panel title="Cơ cấu theo nhóm món">
              <CategoryBreakdown categories={d.categories} />
            </Panel>
            <Panel title="Theo phương thức thanh toán">
              <PaymentBreakdown payments={d.payments} total={d.summary.totalRevenue} />
            </Panel>
            <Panel title="Món bán chạy (món cùng gốc ở các chi nhánh cộng chung)">
              <ItemStructure items={d.topItems} total={d.summary.totalRevenue} />
            </Panel>
          </div>
        </>
      )}
      <Panel title="Nhân viên (các chi nhánh đang lọc)">
        {staff ? (
          <StaffPanel
            rows={staff}
            chiTiet={`${base.split("?")[0]}/nhan-vien?${["pham=chuoi", kyQuery, dangLoc ? `cn=${dangLoc}` : ""].filter(Boolean).join("&")}`}
          />
        ) : <p className="text-sm text-status-late">Không tải được thống kê nhân viên.</p>}
      </Panel>
      <p className="text-xs text-steel">Chi nhánh đang bị khóa (hết hạn / tạm ngưng) không có trong số liệu.</p>
    </div>
  );
}

/** "3,2%" — phần / tổng; tổng 0 → "—". */
function tyLe(phan: number, tong: number): string {
  return tong > 0 ? `${((phan / tong) * 100).toFixed(1).replace(".", ",")}%` : "—";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
      <h2 className="mb-md text-base font-medium text-ink">{title}</h2>
      {children}
    </section>
  );
}
