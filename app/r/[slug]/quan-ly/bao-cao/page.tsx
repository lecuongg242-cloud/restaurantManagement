import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { getReportData, getCancellationBlock } from "@/lib/billing/reports";
import { resolveRange, previousRange } from "@/lib/billing/report-range";
import { getInventoryReportBlock } from "@/lib/inventory/report-server";
import { getPnlBlock } from "@/lib/reports/pnl-server";
import { getBaoCaoNhanVien } from "@/lib/reports/deep";
import { docKy, kyQueryBaoCao } from "@/lib/quan-ly/ky";
import { ChonKy } from "@/components/quan-ly/ChonKy";
import { Trong } from "@/components/quan-ly/Khoi";
import { PnlPanel } from "@/components/admin/reports/PnlPanel";
import { CategoryBreakdown } from "@/components/admin/reports/CategoryBreakdown";
import { ItemStructure } from "@/components/admin/reports/ItemStructure";
import { PaymentBreakdown } from "@/components/admin/reports/PaymentBreakdown";
import { StaffPanel } from "@/components/admin/reports/StaffPanel";
import { CancellationPanel } from "@/components/admin/reports/CancellationPanel";
import { DiscountPanel } from "@/components/admin/reports/DiscountPanel";

export const dynamic = "force-dynamic";

/**
 * Tab Báo cáo (P30, MGR-04, Giao diện B7): các khối mở/gập dùng CHUNG hàm số liệu + khối hiển thị của trang báo cáo admin
 * (cùng kỳ ⇒ cùng số). "Kết quả kinh doanh" chỉ chủ quán (QD-027 C5), như admin. Cuối trang mở báo cáo đầy đủ.
 */
export default async function BaoCaoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ky?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await getSessionMembership(slug);
  if (!session) redirect("/quan-ly");
  if (!canManage(session.role, "reports")) redirect(`/r/${slug}/quan-ly`);
  const now = new Date();
  const ky = docKy(sp.ky);
  const range = resolveRange(ky.input, now);
  const prev = previousRange(range, now);
  const id = session.tenant.id;
  const xemLaiLo = canManage(session.role, "finance");

  const [data, huy, nhanVien, kho] = await Promise.all([
    getReportData(id, range),
    getCancellationBlock(id, range, prev),
    getBaoCaoNhanVien([id], range).catch(() => null),
    xemLaiLo ? getInventoryReportBlock(id, range) : Promise.resolve(null),
  ]);
  const pnl = xemLaiLo ? await getPnlBlock([id], range, kho ?? undefined) : null;
  const tong = data.summary.totalRevenue;
  const kyQuery = kyQueryBaoCao(ky);

  return (
    <div className="flex flex-col gap-md">
      <ChonKy base={`/r/${slug}/quan-ly/bao-cao`} ky={ky} />
      {data.summary.billCount === 0 && <Trong>Chưa có hóa đơn trong {ky.chu.toLowerCase()}.</Trong>}

      <div className="divide-y divide-hairline-soft overflow-hidden rounded-lg border border-hairline-soft bg-canvas shadow-card">
        {pnl && (
          <Muc tieuDe="Kết quả kinh doanh" mo>
            {pnl.ok ? <PnlPanel v={pnl.view} /> : <p className="text-sm text-status-late">Không tải được: {pnl.message}</p>}
          </Muc>
        )}
        <Muc tieuDe="Theo nhóm món" mo={!pnl}>
          <CategoryBreakdown categories={data.categories} />
        </Muc>
        <Muc tieuDe="Theo món">
          <ItemStructure items={data.topItems} total={tong} />
        </Muc>
        <Muc tieuDe="Theo phương thức thanh toán">
          <PaymentBreakdown payments={data.payments} total={tong} />
        </Muc>
        <Muc tieuDe="Theo nhân viên">
          {nhanVien ? <StaffPanel rows={nhanVien} /> : <p className="text-sm text-status-late">Không tải được thống kê nhân viên.</p>}
        </Muc>
        <Muc tieuDe="Món bị hủy">
          {huy.ok ? <CancellationPanel data={huy.data} prev={huy.prev} /> : <p className="text-sm text-status-late">Không tải được: {huy.message}</p>}
        </Muc>
        <Muc tieuDe="Giảm giá">
          {huy.ok ? <DiscountPanel data={huy.discounts} revenue={tong} /> : <p className="text-sm text-status-late">Không tải được: {huy.message}</p>}
        </Muc>
      </div>

      <a
        href={`/r/${slug}/admin/reports?${kyQuery}`}
        className="inline-flex min-h-11 items-center justify-center gap-xs rounded-md border border-hairline-strong bg-canvas px-md text-sm text-ink"
      >
        Xem báo cáo đầy đủ <ExternalLink className="size-4" aria-hidden />
      </a>
    </div>
  );
}

/** Một khối mở/gập; nội dung bảng rộng thì cuộn ngang trong khối, không làm tràn trang. */
function Muc({ tieuDe, mo, children }: { tieuDe: string; mo?: boolean; children: React.ReactNode }) {
  return (
    <details open={mo} className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-md text-sm font-medium text-ink">
        {tieuDe}
        <span aria-hidden className="text-steel transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="overflow-x-auto px-md pb-md">{children}</div>
    </details>
  );
}
