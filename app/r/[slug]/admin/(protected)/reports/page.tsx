import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { getReportData, getComparison, getCancellationBlock, type ReportData, type ComparisonData, type CancellationBlock } from "@/lib/billing/reports";
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
import { DiscountPanel } from "@/components/admin/reports/DiscountPanel";
import { MarginPanel } from "@/components/admin/reports/MarginPanel";
import { WastePanel } from "@/components/admin/reports/WastePanel";
import { getInventoryReportBlock, type InventoryReportBlock } from "@/lib/inventory/report-server";
import Link from "next/link";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { BaoCaoChuoiView } from "@/components/brand/BaoCaoChuoiView";
import { getBaoCaoBan, getBaoCaoNhanVien, getNhomMonTheoTuan, type DiemNhomMon, type DongBan, type DongNhanVien } from "@/lib/reports/deep";
import { StaffPanel } from "@/components/admin/reports/StaffPanel";
import { TableUsagePanel } from "@/components/admin/reports/TableUsagePanel";
import { CategoryTrendChart } from "@/components/admin/reports/CategoryTrendChart";
import { cn } from "@/lib/utils";
import { getDuBao } from "@/lib/forecast/read";
import { ForecastCard } from "@/components/admin/forecast/ForecastCard";
import { PnlPanel } from "@/components/admin/reports/PnlPanel";
import { getPnlBlock } from "@/lib/reports/pnl-server";

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
  searchParams: Promise<{ preset?: string; offset?: string; from?: string; to?: string; bucket?: string; pham?: string; cn?: string }>;
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

  // Chuỗi (P15): báo cáo có thêm phạm vi "Tất cả chi nhánh" — như bộ lọc chi nhánh của KiotViet / Sapo, không có
  // trang báo cáo chuỗi riêng. Chỉ thành viên chuỗi vào được ≥ 2 chi nhánh mới thấy.
  const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
  const coChuoi = !!chuoi && chuoi.branches.length >= 2;
  const kyQuery = new URLSearchParams(
    Object.entries({ preset: sp.preset, offset: sp.offset, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][]
  ).toString();
  const phamVi = coChuoi ? <PhamVi slug={slug} chuoi={sp.pham === "chuoi"} kyQuery={kyQuery} /> : null;
  // "Xuất Excel" (P16 16-04): cùng kỳ + phạm vi đang xem.
  const xuatHref = `/r/${slug}/admin/reports/export?${[kyQuery, coChuoi && sp.pham === "chuoi" ? "pham=chuoi" : "", coChuoi && sp.pham === "chuoi" && sp.cn ? `cn=${sp.cn}` : ""]
    .filter(Boolean)
    .join("&")}`;
  const nutXuat = (
    <a href={xuatHref} className="inline-flex h-9 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface" data-xuat-excel>
      Xuất Excel
    </a>
  );
  // P20 20-04 (REPORT-20): Kết quả kinh doanh — CHỈ chủ quán (QD-027 C5); RPC cũng tự lọc chủ ở DB.
  const xemLaiLo = canManage(session.role, "finance");
  const hrefLaiLo = (pham: boolean) =>
    `/r/${slug}/admin/reports/ket-qua-kinh-doanh?${[kyQuery, pham ? "pham=chuoi" : "", pham && sp.cn ? `cn=${sp.cn}` : ""].filter(Boolean).join("&")}`;

  if (coChuoi && sp.pham === "chuoi") {
    const chon = sp.cn ? new Set(sp.cn.split(",")) : null;
    const dangXem = chon ? chuoi!.branches.filter((b) => chon.has(b.slug)) : chuoi!.branches;
    const pnlChuoi = xemLaiLo ? await getPnlBlock(dangXem.map((b) => b.tenantId), range) : null;
    return (
      <div className="w-full">
        <BaoCaoChuoiView
          all={chuoi!.branches}
          loc={sp.cn}
          range={range}
          prev={prevRange}
          base={`/r/${slug}/admin/reports?pham=chuoi`}
          kyQuery={kyQuery}
          now={now}
          ketQua={
            pnlChuoi && (
              <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
                <h2 className="mb-md text-base font-medium text-ink">Kết quả kinh doanh ({pnlChuoi.ok ? pnlChuoi.branches : 0} chi nhánh bạn là chủ)</h2>
                {pnlChuoi.ok ? (
                  <PnlPanel v={pnlChuoi.view} exportHref={hrefLaiLo(true)} />
                ) : (
                  <p className="text-sm text-status-late">Không tải được kết quả kinh doanh: {pnlChuoi.message}</p>
                )}
              </section>
            )
          }
          dauTrang={
            <div>
              <h1 className="font-display text-2xl text-ink">Báo cáo dòng tiền</h1>
              <p className="text-sm text-steel">{range.label} · giờ Việt Nam · cả chuỗi {chuoi!.brand.name}</p>
              {phamVi}
              <div className="mt-xs">{nutXuat}</div>
            </div>
          }
        />
      </div>
    );
  }

  let data: ReportData;
  let prev: ComparisonData;
  // Khối "Món bị hủy" tự nuốt lỗi của riêng nó (xem getCancellationBlock) — REPORT-10 hỏng thì
  // REPORT-01..09 vẫn phải hiện. Nhờ vậy cũng không còn ràng buộc thứ tự triển khai code ↔ 0029.
  let cancellations: CancellationBlock;
  // P10 (REPORT-13/14): tự nuốt lỗi như khối hủy; null = quán chưa khai nguyên liệu → không render.
  let inventory: InventoryReportBlock;
  try {
    [data, prev, cancellations, inventory] = await Promise.all([
      getReportData(session.tenant.id, range),
      getComparison(session.tenant.id, prevRange),
      getCancellationBlock(session.tenant.id, range, prevRange),
      getInventoryReportBlock(session.tenant.id, range),
    ]);
  } catch (err) {
    return (
      <ReportShell slug={slug} range={range} now={now} phamVi={phamVi} nutXuat={nutXuat}>
        <div className="mt-lg rounded-lg border border-status-late bg-canvas p-lg">
          <p className="text-sm font-medium text-status-late">Không tải được báo cáo.</p>
          <p className="mt-xs text-sm text-steel">
            {err instanceof Error ? err.message : "Lỗi không xác định."} Thử tải lại trang; nếu vẫn lỗi, kiểm tra
            migration <code className="font-mono text-xs">0023_report_rpcs.sql</code> đã chạy chưa.
          </p>
        </div>
      </ReportShell>
    );
  }

  const { summary, series, topItems, categories, channels, areas, payments, hourDow, peakHour, serviceMode } = data;

  // P16 (16-02, 16-03): tự nuốt lỗi như khối hủy — RPC 0068 hỏng không kéo các khối cũ theo.
  let sau: { staff: DongNhanVien[]; ban: DongBan[]; nhom: DiemNhomMon[] } | null = null;
  try {
    const [staff, ban, nhom] = await Promise.all([
      getBaoCaoNhanVien([session.tenant.id], range),
      serviceMode === "table" ? getBaoCaoBan([session.tenant.id], range) : Promise.resolve([] as DongBan[]),
      range.dayCount >= 14 ? getNhomMonTheoTuan([session.tenant.id], range) : Promise.resolve([] as DiemNhomMon[]),
    ]);
    sau = { staff, ban, nhom };
  } catch {
    sau = null;
  }
  // P18: dự báo 7 ngày tới — tự nuốt lỗi như các khối trên (bảng 0073 hỏng không kéo báo cáo theo).
  const duBao = await getDuBao(session.tenant.id).catch(() => null);
  const hasData = summary.billCount > 0;
  const pnl = xemLaiLo ? await getPnlBlock([session.tenant.id], range, inventory) : null;

  return (
    <ReportShell slug={slug} range={range} now={now} phamVi={phamVi} nutXuat={nutXuat}>
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

      {duBao && duBao.trangThai !== "chua-co" && (
        <div className="mt-lg">
          <ForecastCard du={duBao} />
        </div>
      )}

      {pnl && (
        <Panel title="Kết quả kinh doanh" className="mt-lg">
          {pnl.ok ? (
            <PnlPanel v={pnl.view} settingsHref={`/r/${slug}/admin/settings#thue`} exportHref={hrefLaiLo(false)} />
          ) : (
            <p className="text-sm text-status-late">Không tải được kết quả kinh doanh: {pnl.message}</p>
          )}
        </Panel>
      )}

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
        {cancellations.ok ? (
          <CancellationPanel data={cancellations.data} prev={cancellations.prev} />
        ) : (
          <CancelBlockError message={cancellations.message} />
        )}
      </Panel>

      {/* Giảm 100% cho ra đúng kết quả như hủy sạch món nên khối này đứng ngay sau khối hủy.
          `summary.totalRevenue` là mẫu số của tỷ lệ — cùng một kỳ, cùng quy ước BILL-05. */}
      <Panel title="Giảm giá" className="mt-lg">
        {cancellations.ok ? (
          <DiscountPanel data={cancellations.discounts} revenue={summary.totalRevenue} />
        ) : (
          <CancelBlockError message={cancellations.message} />
        )}
      </Panel>

      <Panel title="Nhân viên" className="mt-lg">
        {sau ? <StaffPanel rows={sau.staff} chiTiet={`/r/${slug}/admin/reports/nhan-vien${kyQuery ? `?${kyQuery}` : ""}`} /> : <p className="text-sm text-status-late">Không tải được thống kê nhân viên.</p>}
      </Panel>

      {sau && serviceMode === "table" && sau.ban.some((r) => r.ban !== "Không gắn bàn") && (
        <Panel title="Hiệu quả bàn" className="mt-lg">
          <TableUsagePanel rows={sau.ban} />
        </Panel>
      )}

      {sau && sau.nhom.length > 0 && (
        <Panel title="Nhóm món theo tuần" className="mt-lg">
          <CategoryTrendChart points={sau.nhom} />
        </Panel>
      )}

      {inventory !== null && (
        <>
          <Panel title="Lãi gộp theo món" className="mt-lg">
            {inventory.ok ? <MarginPanel data={inventory.data} /> : <InventoryBlockError message={inventory.message} />}
          </Panel>
          <Panel title="Hao hụt" className="mt-lg">
            {inventory.ok ? <WastePanel data={inventory.data} /> : <InventoryBlockError message={inventory.message} />}
          </Panel>
        </>
      )}
    </ReportShell>
  );
}

const GRAIN_TITLE = { hour: "giờ", day: "ngày", week: "tuần", month: "tháng" } as const;

/**
 * Lỗi của khối hủy + khối giảm giá. Hai khối dùng CHUNG một lời gọi (`getCancellationBlock`) nên
 * hỏng là hỏng cùng nhau — dùng chung một hộp lỗi để không phải chép đôi câu chữ.
 */
function CancelBlockError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-status-late bg-canvas p-md">
      <p className="text-sm font-medium text-status-late">Không tải được thống kê.</p>
      <p className="mt-xs text-sm text-steel">
        {message} Kiểm tra migration{" "}
        <code className="font-mono text-xs">0029_cancel_report_rpcs.sql</code> và{" "}
        <code className="font-mono text-xs">0037_cancel_after_print_rpcs.sql</code> đã chạy chưa. Các
        khối còn lại của báo cáo không bị ảnh hưởng.
      </p>
    </div>
  );
}

/** Lỗi của hai khối P10 — các khối cũ của báo cáo không bị kéo theo. */
function InventoryBlockError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-status-late bg-canvas p-md">
      <p className="text-sm font-medium text-status-late">Không tải được số liệu nguyên liệu.</p>
      <p className="mt-xs text-sm text-steel">
        {message} Kiểm tra migration <code className="font-mono text-xs">0045</code>–
        <code className="font-mono text-xs">0049</code> đã chạy chưa.
      </p>
    </div>
  );
}

/** Khung trang (tiêu đề + bộ chọn kỳ) — dùng chung cho cả nhánh lỗi lẫn nhánh có dữ liệu. */
function ReportShell({
  slug,
  range,
  now,
  phamVi,
  nutXuat,
  children,
}: {
  slug: string;
  range: ReturnType<typeof resolveRange>;
  now: Date;
  /** Bộ chọn "Chi nhánh này / Tất cả chi nhánh" (chỉ quán thuộc chuỗi). */
  phamVi?: React.ReactNode;
  nutXuat?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
        <div>
          <h1 className="font-display text-2xl text-ink">Báo cáo dòng tiền</h1>
          <p className="text-sm text-steel">{range.label} · giờ Việt Nam</p>
          {phamVi}
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          {nutXuat}
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

/** Phạm vi báo cáo của quán thuộc chuỗi: chi nhánh đang mở / tất cả chi nhánh. Giữ nguyên kỳ đang xem. */
function PhamVi({ slug, chuoi, kyQuery }: { slug: string; chuoi: boolean; kyQuery: string }) {
  const base = `/r/${slug}/admin/reports`;
  const muc = [
    { chu: "Chi nhánh này", href: kyQuery ? `${base}?${kyQuery}` : base, bat: !chuoi },
    { chu: "Tất cả chi nhánh", href: `${base}?pham=chuoi${kyQuery ? `&${kyQuery}` : ""}`, bat: chuoi },
  ];
  return (
    <nav aria-label="Phạm vi báo cáo" className="mt-xs flex gap-xs text-sm" data-pham-vi>
      {muc.map((m) => (
        <Link
          key={m.chu}
          href={m.href}
          aria-current={m.bat ? "page" : undefined}
          className={cn("rounded-full border px-sm py-[2px]", m.bat ? "border-ink bg-ink text-canvas" : "border-hairline-strong text-slate")}
        >
          {m.chu}
        </Link>
      ))}
    </nav>
  );
}
