import { NextResponse } from "next/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { taoXlsx } from "@/lib/reports/xlsx";

export const dynamic = "force-dynamic";

/** File mẫu "Nhập Excel" bàn (P36, TABLE-08): cột Tên bàn · Khu vực · Số ghế + 3 dòng ví dụ (như "Tải file mẫu" KiotViet). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "tables")) {
    return NextResponse.json({ error: "Không đủ quyền." }, { status: 403 });
  }
  const file = taoXlsx([
    {
      ten: "Bàn",
      cot: [
        { nhan: "Tên bàn", rong: 20 },
        { nhan: "Khu vực", rong: 20 },
        { nhan: "Số ghế", rong: 10 },
      ],
      dong: [
        ["Bàn 1", "Tầng 1", 4],
        ["Bàn 2", "Tầng 1", 4],
        ["VIP 1", "Phòng VIP", 10],
      ],
    },
  ]);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-nhap-ban.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
