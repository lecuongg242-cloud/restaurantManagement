import { NextResponse } from "next/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkTaiBoCai, linkTaiBoCaiKemMa } from "@/lib/print/bo-cai";
import { taoMaChoChuQuan, type CAU_LOI } from "@/lib/print/ma-chu-quan";

export const dynamic = "force-dynamic";
// Chủ quán: tải 33 MB từ Storage, chèn mã, đưa lại lên — vài giây, vượt mặc định của gói Hobby.
export const maxDuration = 60;

/**
 * POST /r/[slug]/admin/printers/bo-cai — tải bộ cài cầu in (PRINT-17). Owner/manager của quán.
 *
 * Chủ quán: tạo mã kích hoạt và CHÈN VÀO BỘ CÀI (`bo-cai\ma-kich-hoat.txt`) → cài không phải gõ mã.
 * Quản lý: bộ cài gốc, không kèm mã (lúc cài sẽ hỏi).
 *
 * POST (không phải GET) vì mỗi lần bấm phát một mã: GET có thể bị trình duyệt/tiện ích tải trước.
 * Trả 303 sang link Storage ký hạn 60 giây — trình duyệt tải file, trang đứng yên.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!canManage(session.role, "printers")) return NextResponse.json({ error: "Không có quyền." }, { status: 403 });
  // Form của chính trang Máy in — chặn trang lạ tự gửi form để phát mã.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) {
    return NextResponse.json({ error: "Không có quyền." }, { status: 403 });
  }

  const veTrang = (loi: keyof typeof CAU_LOI) =>
    NextResponse.redirect(new URL(`/r/${slug}/admin/printers?loi=${loi}`, req.url), 303);

  const admin = createAdminClient();
  let link: string | null;
  if (session.role === "owner") {
    const ma = await taoMaChoChuQuan(session);
    if ("error" in ma) return veTrang(ma.error);
    try {
      link = await linkTaiBoCaiKemMa(admin, ma.code);
    } catch (err) {
      console.error(JSON.stringify({ evt: "bo-cai-kem-ma-loi", msg: err instanceof Error ? err.message : String(err) }));
      return veTrang("khac");
    }
  } else {
    link = await linkTaiBoCai(admin);
  }
  if (!link) return veTrang("chua-co-bo-cai");
  return NextResponse.redirect(link, 303);
}
