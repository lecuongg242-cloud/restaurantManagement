import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { getReportData, getComparison, getCancellationBlock, type TopItem, type RevenuePoint } from "@/lib/billing/reports";
import { resolveRange, previousRange, deltaPct, type Grain } from "@/lib/billing/report-range";
import { getPosSnapshot } from "@/lib/orders/pos";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { getBaoCaoChuoi } from "@/lib/brand/reports";
import { formatVnd } from "@/lib/orders/cart";
import { docKy, type Ky } from "@/lib/quan-ly/ky";
import { tomTatDangPhucVu } from "@/lib/quan-ly/dang-phuc-vu";
import { gioVn } from "@/lib/quan-ly/dinh-dang";
import { KpiCard } from "@/components/admin/reports/KpiCard";
import { RevenueChart } from "@/components/admin/reports/RevenueChart";
import { ChonKy } from "@/components/quan-ly/ChonKy";
import { Khoi, TheSo, Trong } from "@/components/quan-ly/Khoi";

export const dynamic = "force-dynamic";

/**
 * Tab Tổng quan (P30, MGR-02, Giao diện B5). Doanh thu / số HĐ / TB / món hủy / biểu đồ / món bán chạy lấy từ CÙNG các
 * hàm của trang báo cáo admin (`getReportData`, `getComparison`, `getCancellationBlock`) với cùng kỳ (`resolveRange`)
 * ⇒ khớp từng đồng. "Đang phục vụ" cộng như sơ đồ bàn POS. `?pham=chuoi` → gộp tất cả chi nhánh (Giao diện B3).
 */
export default async function TongQuanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ky?: string; pham?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSessionMembership(slug);
  if (!session) redirect("/quan-ly");
  const now = new Date();
  const ky = docKy(sp.ky);
  const range = resolveRange(ky.input, now);
  const prev = previousRange(range, now);
  const base = `/r/${slug}/quan-ly`;

  if (sp.pham === "chuoi") {
    const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
    if (chuoi && chuoi.branches.length >= 2) {
      const bc = await getBaoCaoChuoi(chuoi.branches.map((b) => b.tenantId), range, prev);
      const ten = new Map(chuoi.branches.map((b) => [b.tenantId, b.name]));
      return (
        <div className="flex flex-col gap-md">
          <div className="flex items-center justify-between gap-sm">
            <p className="text-sm text-steel">
              Tất cả chi nhánh · <span className="text-ink">{chuoi.brand.name}</span>
            </p>
            <Link href={sp.ky ? `${base}?ky=${sp.ky}` : base} className="min-h-9 text-sm text-primary-deep underline">
              Chi nhánh này
            </Link>
          </div>
          <ChonKy base={base} ky={ky} them={{ pham: "chuoi" }} />
          <ThanDoanhThu ky={ky} tong={bc.summary} truoc={bc.prevSummary} />
          {bc.summary.billCount === 0 ? (
            <Trong>Chưa có hóa đơn trong {ky.chu.toLowerCase()}.</Trong>
          ) : (
            <>
              <Khoi tieuDe="Theo chi nhánh">
                <ul className="divide-y divide-hairline-soft">
                  {[...bc.branches].sort((a, b) => b.revenue - a.revenue).map((b) => (
                    <li key={b.tenantId} className="flex items-center justify-between gap-sm py-xs text-sm">
                      <span className="min-w-0 truncate text-ink">{ten.get(b.tenantId) ?? "—"}</span>
                      <span className="shrink-0 tabular-nums text-steel">{b.billCount} HĐ</span>
                      <span className="w-28 shrink-0 text-right font-medium tabular-nums text-ink">{formatVnd(b.revenue)}</span>
                    </li>
                  ))}
                </ul>
              </Khoi>
              <BieuDo series={bc.series} prev={bc.prevSeries} grain={range.grain} />
              <BanChay items={bc.topItems} />
            </>
          )}
        </div>
      );
    }
  }

  const [data, so, huy, snap] = await Promise.all([
    getReportData(session.tenant.id, range),
    getComparison(session.tenant.id, prev),
    getCancellationBlock(session.tenant.id, range, prev),
    getPosSnapshot(session.tenant.id, slug),
  ]);
  const phucVu = tomTatDangPhucVu(snap);

  return (
    <div className="flex flex-col gap-md">
      <ChonKy base={base} ky={ky} />
      <ThanDoanhThu
        ky={ky}
        tong={data.summary}
        truoc={so.summary}
        monHuy={huy.ok ? { soLuong: huy.data.summary.cancelledQty, tien: huy.data.summary.cancelledAmount } : null}
      />

      <Khoi className="p-0">
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-sm px-md py-sm">
            <span>
              <span className="block text-sm font-medium text-ink">Đang phục vụ</span>
              <span className="block text-sm text-steel">
                {phucVu.soBanCoKhach}/{phucVu.tongBan} bàn có khách
              </span>
            </span>
            <span className="text-right">
              <span className="block text-lg font-semibold tabular-nums text-ink">{formatVnd(phucVu.tamTinh)}</span>
              <span className="block text-xs text-steel">tạm tính chưa thu</span>
            </span>
          </summary>
          {phucVu.ds.length > 0 ? (
            <ul className="divide-y divide-hairline-soft border-t border-hairline-soft px-md">
              {phucVu.ds.map((b) => (
                <li key={`${b.ban}-${b.gioVao}`} className="flex items-center justify-between gap-sm py-xs text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">{b.ban}</span>
                  <span className="shrink-0 tabular-nums text-steel">vào {gioVn(b.gioVao)}</span>
                  <span className="w-28 shrink-0 text-right tabular-nums text-ink">{formatVnd(b.tamTinh)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-hairline-soft px-md py-sm text-sm text-steel">Chưa có bàn nào đang phục vụ.</p>
          )}
        </details>
      </Khoi>

      {data.summary.billCount === 0 ? (
        <Trong>Chưa có hóa đơn trong {ky.chu.toLowerCase()}.</Trong>
      ) : (
        <>
          <BieuDo series={data.series} prev={so.series} grain={range.grain} />
          <BanChay items={data.topItems} />
        </>
      )}
    </div>
  );
}

function ThanDoanhThu({
  ky,
  tong,
  truoc,
  monHuy,
}: {
  ky: Ky;
  tong: { totalRevenue: number; billCount: number; avgPerBill: number };
  truoc: { totalRevenue: number; billCount: number };
  monHuy?: { soLuong: number; tien: number } | null;
}) {
  return (
    <>
      <KpiCard
        label={`Doanh thu · ${ky.chu.toLowerCase()}`}
        value={formatVnd(tong.totalRevenue)}
        delta={deltaPct(tong.totalRevenue, truoc.totalRevenue)}
        hint={`Kỳ trước: ${formatVnd(truoc.totalRevenue)}`}
        accent
      />
      <div className="grid grid-cols-3 gap-sm">
        <TheSo nhan="Số hóa đơn" so={String(tong.billCount)} phu={`Kỳ trước ${truoc.billCount}`} />
        <TheSo nhan="TB/hóa đơn" so={formatVnd(tong.avgPerBill)} />
        {monHuy === undefined ? (
          <TheSo nhan="Chi nhánh" so="—" />
        ) : (
          <TheSo nhan="Món hủy" so={monHuy ? String(monHuy.soLuong) : "—"} phu={monHuy ? formatVnd(monHuy.tien) : "Chưa tải được"} />
        )}
      </div>
    </>
  );
}

function BieuDo({ series, prev, grain }: { series: RevenuePoint[]; prev: number[]; grain: Grain }) {
  return (
    <Khoi tieuDe={grain === "hour" ? "Doanh thu theo giờ" : "Doanh thu theo ngày"}>
      <RevenueChart series={series} prevSeries={prev} grain={grain} />
    </Khoi>
  );
}

function BanChay({ items }: { items: TopItem[] }) {
  return (
    <Khoi tieuDe="Món bán chạy">
      <ol className="divide-y divide-hairline-soft">
        {items.slice(0, 5).map((m, i) => (
          <li key={m.name} className="flex items-center gap-sm py-xs text-sm">
            <span className="w-5 shrink-0 text-steel tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{m.name}</span>
            <span className="shrink-0 tabular-nums text-steel">×{m.qty}</span>
            <span className="w-24 shrink-0 text-right tabular-nums text-ink">{formatVnd(m.revenue)}</span>
          </li>
        ))}
      </ol>
    </Khoi>
  );
}
