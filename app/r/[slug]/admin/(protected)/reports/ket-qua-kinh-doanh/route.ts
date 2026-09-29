import { NextResponse, type NextRequest } from "next/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/billing/report-range";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { getPnlBlock } from "@/lib/reports/pnl-server";
import { taoXlsx, tenFileXuat } from "@/lib/reports/xlsx";

export const dynamic = "force-dynamic";

/** "Xuất Excel kết quả kinh doanh" (REPORT-20) — CHỈ chủ quán (QD-027 C5), cùng kỳ + phạm vi đang xem. Ghi `export_logs`. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "finance")) {
    return NextResponse.json({ error: "Không đủ quyền." }, { status: 403 });
  }
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries()) as Record<string, string | undefined>;
  const now = new Date();
  const range = resolveRange(sp, now);
  let ids = [session.tenant.id];
  let tieuDe = session.tenant.name;
  if (sp.pham === "chuoi") {
    const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
    if (chuoi && chuoi.branches.length >= 2) {
      const chon = sp.cn ? new Set(sp.cn.split(",")) : null;
      const dang = chon ? chuoi.branches.filter((b) => chon.has(b.slug)) : chuoi.branches;
      ids = dang.map((b) => b.tenantId);
      tieuDe = `Chuỗi ${chuoi.brand.name}`;
    }
  }
  const block = await getPnlBlock(ids, range);
  if (!block) return NextResponse.json({ error: "Không đủ quyền." }, { status: 403 });
  if (!block.ok) return NextResponse.json({ error: block.message }, { status: 500 });
  const v = block.view;

  const dong: (string | number)[][] = [
    ["Quán", tieuDe],
    ["Kỳ", `${range.fromDay} → ${range.toDay}`],
    [],
    ["Doanh thu bán hàng", v.grossSales],
    ["Giảm giá", -v.discount],
    ["Doanh thu món thuần", v.netItemRevenue],
    ["Phí phục vụ", v.serviceCharge],
    ["Doanh thu thuần", v.netRevenue],
    [v.cogsMode === "closing" ? "Giá vốn hàng bán" : "Chi phí mua nguyên liệu (theo phiếu nhập)", -v.cogs],
    ["Lợi nhuận gộp", v.grossProfit],
    ...v.expenses.map((e) => [`  ${e.name}`, -e.amount]),
    ["Tổng chi phí", -v.totalExpenses],
    ["Thu nhập khác", v.otherIncome],
    ["Lợi nhuận", v.profit],
    ...v.taxes.map((t) => [`  ${t.name} ${t.pct}% ${t.base === "revenue" ? "doanh thu" : "lợi nhuận"} (ước tính)`, -t.amount]),
    ...(v.taxes.length > 0 ? [["Lợi nhuận sau thuế", v.profitAfterTax]] : []),
    [],
    ["VAT (khách trả, không phải doanh thu)", v.vat],
    ["Doanh thu (KPI) = Doanh thu thuần + VAT", v.kpiRevenue],
  ];
  const file = taoXlsx([{ ten: "Kết quả kinh doanh", cot: [{ nhan: "Chỉ tiêu", rong: 48 }, { nhan: "Số tiền", rong: 18 }], dong }], now);

  const supabase = await createClient();
  await supabase.from("export_logs").insert({
    tenant_id: session.tenant.id,
    membership_id: session.membershipId,
    kind: "pnl",
    from_day: range.fromDay,
    to_day: range.toDay,
  });
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${tenFileXuat(slug, "ket-qua-kinh-doanh", range.fromDay, range.toDay)}"`,
      "Cache-Control": "no-store",
    },
  });
}
