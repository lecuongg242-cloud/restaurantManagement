import { NextResponse } from "next/server";
import { goiPhatHanh, TEP_HOP_LE } from "@/lib/desktop/phat-hanh";

export const dynamic = "force-dynamic";

/**
 * GET /api/desktop/update/[file] — nguồn cập nhật của app "TechMenu Thu ngân" (electron-updater, provider generic,
 * DESK-10). Chuyển tiếp tới nơi đặt bản phát hành (`DESKTOP_RELEASE_BASE`): `latest.yml`, tệp cài, `.blockmap`.
 * Công khai: tệp cài không chứa bí mật (tài khoản máy in cấp lúc kích hoạt, lưu ở từng máy). Chỉ nhận đúng tên tệp
 * electron-builder sinh ra — không thành chỗ chuyển hướng tùy ý.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const goc = goiPhatHanh();
  if (!goc || !TEP_HOP_LE.test(file)) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(`${goc}/${file}`, { status: 302, headers: { "Cache-Control": "no-store" } });
}
