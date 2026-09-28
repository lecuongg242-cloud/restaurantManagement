import { NextResponse, type NextRequest } from "next/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { getReportData } from "@/lib/billing/reports";
import { previousRange, resolveRange } from "@/lib/billing/report-range";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { getBaoCaoChuoi } from "@/lib/brand/reports";
import { getBaoCaoBan, getBaoCaoNhanVien, getNhomMonTheoTuan } from "@/lib/reports/deep";
import { trangTinhBaoCao, type DuLieuXuat } from "@/lib/reports/export-sheets";
import { taoXlsx, tenFileXuat } from "@/lib/reports/xlsx";

export const dynamic = "force-dynamic";

/**
 * "Xuất Excel" trang báo cáo (P16 16-04, REPORT-19) — như "Xuất báo cáo" của Sapo / "Xuất file" của KiotViet: xuất
 * ĐÚNG báo cáo đang xem (cùng kỳ, cùng phạm vi chi nhánh), mỗi khối một trang tính. Gọi CÙNG hàm lấy số với màn
 * hình — một nguồn số. Chỉ chủ / quản lý (canManage "reports"); mỗi lần xuất ghi `export_logs`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "reports")) {
    return NextResponse.json({ error: "Không đủ quyền." }, { status: 403 });
  }
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries()) as Record<string, string | undefined>;
  const now = new Date();
  const range = resolveRange(sp, now);
  const prev = previousRange(range, now);
  const kyNhan = `${range.fromDay} → ${range.toDay}`;

  let du: DuLieuXuat;
  let kind: "report" | "report_chain" = "report";
  const chuoi = sp.pham === "chuoi" ? await chuoiCuaQuan(session.tenant.id, session.userId) : null;
  if (chuoi && chuoi.branches.length >= 2) {
    kind = "report_chain";
    const chon = sp.cn ? new Set(sp.cn.split(",")) : null;
    const dang = chon ? chuoi.branches.filter((b) => chon.has(b.slug)) : chuoi.branches;
    const ids = dang.map((b) => b.tenantId);
    const ten = new Map(chuoi.branches.map((b) => [b.tenantId, b.name]));
    const [d, staff] = await Promise.all([getBaoCaoChuoi(ids, range, prev), getBaoCaoNhanVien(ids, range).catch(() => null)]);
    du = {
      tieuDe: `Chuỗi ${chuoi.brand.name} (${dang.length} chi nhánh)`,
      kyNhan,
      summary: d.summary,
      series: d.series,
      categories: d.categories,
      topItems: d.topItems,
      payments: d.payments,
      branches: d.branches.map((b) => ({ ten: ten.get(b.tenantId) ?? "—", revenue: b.revenue, billCount: b.billCount, avgPerBill: b.avgPerBill, prevRevenue: b.prevRevenue })),
      staff,
    };
  } else {
    const ids = [session.tenant.id];
    const [d, staff, ban, nhomTuan] = await Promise.all([
      getReportData(session.tenant.id, range),
      getBaoCaoNhanVien(ids, range).catch(() => null),
      getBaoCaoBan(ids, range).catch(() => null),
      getNhomMonTheoTuan(ids, range).catch(() => null),
    ]);
    du = {
      tieuDe: session.tenant.name,
      kyNhan,
      summary: d.summary,
      series: d.series,
      categories: d.categories,
      topItems: d.topItems,
      payments: d.payments,
      areas: d.areas,
      staff,
      ban: d.serviceMode === "table" ? ban : null,
      nhomTuan,
    };
  }

  const file = taoXlsx(trangTinhBaoCao(du), now);
  const supabase = await createClient();
  await supabase.from("export_logs").insert({
    tenant_id: session.tenant.id,
    membership_id: session.membershipId,
    kind,
    from_day: range.fromDay,
    to_day: range.toDay,
  });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${tenFileXuat(slug, kind === "report_chain" ? "bao-cao-chuoi" : "bao-cao", range.fromDay, range.toDay)}"`,
      "Cache-Control": "no-store",
    },
  });
}
