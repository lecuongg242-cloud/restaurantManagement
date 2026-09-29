import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dangNhapRoiThuHoi, docDauVao, kichHoatMayQuay, LOI_DU_LIEU } from "@/lib/desktop/kich-hoat";
import { RULES, checkRateLimit, clientIp, tooManyResponse } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/desktop/activate { email, password, tenantId?, coMayIn } — app "TechMenu Thu ngân" kích hoạt máy quầy
 * bằng tài khoản chủ quán (DESK-01, QD-026 D6).
 *
 * Trả: `{ chonChiNhanh }` khi chủ có nhiều chi nhánh; hoặc quán + (máy có máy in) tài khoản `printer` + khóa CÔNG
 * KHAI của Supabase. Không bao giờ trả service-role (QD-012 §1). Mật khẩu chủ quán chỉ dùng để kiểm rồi bỏ — phiên
 * đăng nhập bị thu hồi ngay. Không log thân yêu cầu/phản hồi.
 */
export async function POST(req: Request) {
  const rlIp = await checkRateLimit(RULES.desktopActivate, [clientIp(req.headers)]);
  if (!rlIp.ok) return tooManyResponse(rlIp);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: LOI_DU_LIEU }, { status: 400 });
  }
  const vao = docDauVao(body);
  if (!vao) return NextResponse.json({ error: LOI_DU_LIEU }, { status: 400 });

  const rlEmail = await checkRateLimit(RULES.desktopActivate, ["email", vao.email]);
  if (!rlEmail.ok) return tooManyResponse(rlEmail);

  const kq = await kichHoatMayQuay(createAdminClient(), dangNhapRoiThuHoi, vao);
  const khongLuu = { headers: { "Cache-Control": "no-store" } };
  if (kq.loai === "loi") return NextResponse.json({ error: kq.error }, { status: kq.status, ...khongLuu });
  if (kq.loai === "chon-chi-nhanh") return NextResponse.json({ chonChiNhanh: kq.chiNhanh }, khongLuu);

  const origin = new URL(req.url).origin;
  return NextResponse.json(
    {
      slug: kq.slug,
      tenantName: kq.tenantName,
      appUrl: `${origin}/r/${kq.slug}/pos`,
      ...(kq.may
        ? {
            email: kq.may.email,
            password: kq.may.password,
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          }
        : {}),
    },
    khongLuu
  );
}
