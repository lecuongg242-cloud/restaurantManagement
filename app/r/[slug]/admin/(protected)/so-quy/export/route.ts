import { NextResponse, type NextRequest } from "next/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/billing/report-range";
import { loadCashbook } from "@/lib/cashbook/data";
import { FUND_LABEL, type Fund } from "@/lib/cashbook/labels";
import { gioNgayNamVn } from "@/lib/time/vn";
import { taoXlsx, tenFileXuat } from "@/lib/reports/xlsx";

export const dynamic = "force-dynamic";

/** "Xuất file" sổ quỹ (CASH-01) — ĐÚNG sổ đang xem (quỹ + kỳ), cùng hàm lấy số với màn hình. Ghi `export_logs`. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "cashbook")) {
    return NextResponse.json({ error: "Không đủ quyền." }, { status: 403 });
  }
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries()) as Record<string, string | undefined>;
  const quy: Fund | "all" = sp.quy === "bank" || sp.quy === "all" ? sp.quy : "cash";
  const now = new Date();
  const range = resolveRange(sp, now);
  const supabase = await createClient();
  const { summary, flows } = await loadCashbook(supabase, session.tenant.id, quy, range.fromUtc, range.toUtc);
  const tenQuy = quy === "all" ? "Tổng quỹ" : FUND_LABEL[quy];

  const file = taoXlsx(
    [
      {
        ten: "Tổng hợp",
        cot: [{ nhan: "Mục", rong: 28 }, { nhan: "Số tiền", rong: 18 }],
        dong: [
          ["Quán", session.tenant.name],
          ["Quỹ", tenQuy],
          ["Kỳ", `${range.fromDay} → ${range.toDay}`],
          ["Quỹ đầu kỳ", summary.opening],
          ["Tổng thu", summary.totalIn],
          ["Tổng chi", summary.totalOut],
          ["Tồn quỹ", summary.closing],
        ],
      },
      {
        ten: "Chi tiết",
        cot: [
          { nhan: "Mã phiếu", rong: 12 },
          { nhan: "Thời gian", rong: 18 },
          { nhan: "Quỹ", rong: 12 },
          { nhan: "Loại thu chi", rong: 26 },
          { nhan: "Người nộp/nhận", rong: 22 },
          { nhan: "Thu", rong: 14 },
          { nhan: "Chi", rong: 14 },
          { nhan: "Trạng thái", rong: 12 },
          { nhan: "Ghi chú", rong: 30 },
        ],
        dong: [...flows].reverse().map((f) => [
          f.code ?? "",
          f.kind === "sales" ? gioNgayNamVn(f.occurred_at).slice(6) : gioNgayNamVn(f.occurred_at),
          FUND_LABEL[f.fund],
          f.kind === "sales" ? `Thu tiền bán hàng (${f.sales_count} hóa đơn)` : f.category ?? "",
          f.counterparty ?? "",
          // Phiếu đã hủy không vào cột tiền — tổng cột Thu / Chi khớp số trên màn (REPORT-19).
          f.direction === "in" && f.status === "active" ? f.amount : null,
          f.direction === "out" && f.status === "active" ? f.amount : null,
          f.status === "cancelled" ? `Đã hủy (${f.amount.toLocaleString("vi-VN")}₫)` : "",
          f.note ?? "",
        ]),
      },
    ],
    now
  );
  await supabase.from("export_logs").insert({
    tenant_id: session.tenant.id,
    membership_id: session.membershipId,
    kind: "cashbook",
    from_day: range.fromDay,
    to_day: range.toDay,
    row_count: flows.length,
  });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${tenFileXuat(slug, "so-quy", range.fromDay, range.toDay)}"`,
      "Cache-Control": "no-store",
    },
  });
}
