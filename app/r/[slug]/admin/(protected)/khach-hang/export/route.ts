import { NextResponse, type NextRequest } from "next/server";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { danhSachKhach, KENH, type Khach } from "@/lib/reports/customers";
import { gioNgayNamVn } from "@/lib/time/vn";
import { taoXlsx, tenFileXuat } from "@/lib/reports/xlsx";

export const dynamic = "force-dynamic";

/**
 * Xuất danh sách khách ra Excel (P16 16-04 / 16-05). CHỈ CHỦ QUÁN — file mang SĐT khách ra khỏi hệ thống (quản lý xem
 * được trên màn nhưng không xuất). Lấy theo trang 100 dòng ở server (PostgREST trần 1000). Ghi export_logs.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "Chỉ chủ quán được xuất danh sách khách." }, { status: 403 });
  }

  const chuoi = req.nextUrl.searchParams.get("pham") === "chuoi" ? await chuoiCuaQuan(session.tenant.id, session.userId) : null;
  const ids = chuoi && chuoi.branches.length >= 2 ? chuoi.branches.map((b) => b.tenantId) : [session.tenant.id];
  const tat: Khach[] = [];
  for (let page = 1; page <= 200; page++) {
    const { rows } = await danhSachKhach(ids, { sort: "spent", page, limit: 100 });
    tat.push(...rows);
    if (rows.length < 100) break;
  }

  const now = new Date();
  const file = taoXlsx(
    [
      {
        ten: "Khách hàng",
        cot: [
          { nhan: "Khách hàng", rong: 24 },
          { nhan: "Điện thoại", rong: 14 },
          { nhan: "Số lần" },
          { nhan: "Tổng chi tiêu (đ)", rong: 16 },
          { nhan: "Lần đầu", rong: 18 },
          { nhan: "Lần gần nhất", rong: 18 },
          { nhan: "Kênh hay dùng", rong: 14 },
          { nhan: "Đặt bàn" },
          { nhan: "Ghi chú", rong: 30 },
        ],
        dong: tat.map((k) => [
          k.ten,
          k.phone,
          k.soLan,
          k.tongChi,
          gioNgayNamVn(k.lanDau),
          gioNgayNamVn(k.ganNhat),
          k.kenh ? (KENH[k.kenh] ?? k.kenh) : null,
          k.datBan,
          k.ghiChu,
        ]),
      },
    ],
    now
  );
  const supabase = await createClient();
  await supabase.from("export_logs").insert({
    tenant_id: session.tenant.id,
    membership_id: session.membershipId,
    kind: "customers",
    row_count: tat.length,
  });
  const ngay = now.toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${tenFileXuat(slug, "khach-hang", ngay, ngay)}"`,
      "Cache-Control": "no-store",
    },
  });
}
