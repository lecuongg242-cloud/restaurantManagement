import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dungAnhPhieu, type PhieuAnh } from "@/lib/print/anh-phieu";

export const dynamic = "force-dynamic";

/**
 * GET /api/print/jobs/[id]/image?w=80|58 — ảnh PNG của một phiếu hóa đơn / phiếu khách trong hàng đợi,
 * cho CẦU IN của đúng quán đó (PRINT-14). Cầu in gửi `Authorization: Bearer <token>` của tài khoản
 * `printer` (QD-012 — không service-role ở máy quán).
 *
 * Ảnh dựng từ bản chụp `payload.anh` lúc bấm in, nên cầu in không cần quyền đọc hóa đơn. Phiếu không
 * thuộc quán của tài khoản → 404 (không lộ phiếu có tồn tại hay không).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return NextResponse.json({ error: "Thiếu xác thực." }, { status: 401 });

  const admin = createAdminClient();
  const { data: nguoi } = await admin.auth.getUser(token);
  if (!nguoi?.user) return NextResponse.json({ error: "Xác thực không hợp lệ." }, { status: 401 });

  const { id } = await params;
  const khongThay = () => NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });

  const { data: job } = await admin.from("print_jobs").select("tenant_id, type, payload").eq("id", id).maybeSingle();
  if (!job) return khongThay();

  const [{ data: thanhVien }, { data: quan }] = await Promise.all([
    admin
      .from("memberships")
      .select("id")
      .eq("tenant_id", job.tenant_id)
      .eq("user_id", nguoi.user.id)
      .eq("role", "printer")
      .eq("active", true)
      .maybeSingle(),
    admin.from("tenants").select("status").eq("id", job.tenant_id).maybeSingle(),
  ]);
  if (!thanhVien || quan?.status !== "active") return khongThay();

  const anh = (job.payload as { anh?: PhieuAnh } | null)?.anh;
  if (!anh || (anh.loai !== "receipt" && anh.loai !== "customer_ticket")) return khongThay();

  const kho = new URL(req.url).searchParams.get("w") === "58" ? "58" : "80";
  return dungAnhPhieu(anh, kho);
}
