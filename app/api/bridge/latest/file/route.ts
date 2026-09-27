import { docBanPhatHanh } from "@/lib/print/bridge-release";

export const dynamic = "force-dynamic";

/** GET /api/bridge/latest/file — nội dung `print-bridge.mjs` đang deploy (PRINT-12). Cầu in kiểm SHA trước khi thay. */
export async function GET() {
  const { noiDung } = docBanPhatHanh();
  return new Response(new Uint8Array(noiDung), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  });
}
