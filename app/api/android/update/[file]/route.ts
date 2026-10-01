import { NextResponse } from "next/server";
import { goiPhatHanhAndroid, TEP_HOP_LE_ANDROID } from "@/lib/android/phat-hanh";

export const dynamic = "force-dynamic";

/**
 * GET /api/android/update/[file] — nguồn tải bản cập nhật của app Android (ANDR-04). Chuyển tiếp tới nơi đặt bản phát
 * hành; chỉ nhận đúng tên tệp `android/scripts/phat-hanh.mjs` sinh ra. Công khai: APK không chứa bí mật (tài khoản máy in
 * cấp lúc kích hoạt, lưu ở từng máy).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const goc = goiPhatHanhAndroid();
  if (!goc || !TEP_HOP_LE_ANDROID.test(file)) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(`${goc}/${file}`, { status: 302, headers: { "Cache-Control": "no-store" } });
}
