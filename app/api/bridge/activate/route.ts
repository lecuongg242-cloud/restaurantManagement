import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redeemActivationCode } from "@/lib/print/activation";
import { RULES, checkRateLimit, clientIp, tooManyResponse } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/bridge/activate { code } — bộ cài cầu in đổi mã kích hoạt lấy cấu hình (PRINT-11, QD-019 D6).
 *
 * Trả MỘT lần: tài khoản `printer` của đúng quán + khóa CÔNG KHAI của Supabase + địa chỉ POS. Không bao
 * giờ trả service-role (QD-012 §1). Mật khẩu chỉ đi qua HTTPS tới bộ cài; không ghi log thân phản hồi,
 * và Sentry đã gỡ body (`lib/observability/scrub.ts`).
 */
export async function POST(req: Request) {
  const rl = await checkRateLimit(RULES.bridgeActivate, [clientIp(req.headers)]);
  if (!rl.ok) return tooManyResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }
  const code = (body as { code?: unknown } | null)?.code;

  const r = await redeemActivationCode(createAdminClient(), code);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });

  const origin = new URL(req.url).origin;
  return NextResponse.json(
    {
      slug: r.slug,
      email: r.email,
      password: r.password,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      appUrl: `${origin}/r/${r.slug}/pos`,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
