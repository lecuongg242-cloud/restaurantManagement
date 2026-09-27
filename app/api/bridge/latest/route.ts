import { NextResponse } from "next/server";
import { docBanPhatHanh } from "@/lib/print/bridge-release";

export const dynamic = "force-dynamic";

/**
 * GET /api/bridge/latest — cầu in ở quán hỏi mỗi giờ: có bản mới không (PRINT-12, QD-019 D8).
 * Công khai: tệp cầu in không chứa bí mật nào (thông tin đăng nhập nằm ở `.env.local` của từng máy).
 */
export async function GET() {
  const { version, sha256 } = docBanPhatHanh();
  return NextResponse.json(
    { version, sha256, url: "/api/bridge/latest/file" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
