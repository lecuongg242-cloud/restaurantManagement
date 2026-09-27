import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkHealth, healthBody } from "@/lib/observability/health";

export const dynamic = "force-dynamic";

/**
 * Sống/chết cho dịch vụ theo dõi ngoài (OPS-10, QD-019 D3) — gọi 5 phút/lần.
 *
 * Một lượt đọc thật qua PostgREST bằng anon key: đi đúng đường app dùng (Vercel → Supabase), không cần
 * service-role. RLS trả 0 dòng cho anon — không sao, thứ cần biết là DB có trả lời hay không.
 * Nằm ngoài middleware (xem `config.matcher`) để không tạo thêm lượt xác thực và dòng log mỗi 5 phút.
 */
const HET_GIO_MS = 3000;

async function probe(): Promise<void> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.from("tenants").select("id").limit(1);
  if (error) throw new Error(error.message);
}

export async function GET() {
  const r = await checkHealth(probe, HET_GIO_MS);
  return NextResponse.json(healthBody(r), {
    status: r.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
