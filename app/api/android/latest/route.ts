import { NextResponse } from "next/server";
import { APP_ANDROID, docAppAndroid, goiPhatHanhAndroid, thongTinAndroid } from "@/lib/android/phat-hanh";

export const dynamic = "force-dynamic";

/**
 * GET /api/android/latest — tải APK "TechMenu Thu ngân" mới nhất (ANDR-01). Link cố định cho nút ở Admin → Máy in và
 * trang /huong-dan-cai-dat — đổi nơi đặt tệp không phải sửa link nào. `?thongTin=1` ⇒ trả JSON phiên bản cho app tự cập
 * nhật (ANDR-04): app tải tệp theo `duongDan` rồi tự kiểm `sha256` trước khi cài.
 */
export async function GET(req: Request) {
  // `?app=quan-ly` (P30, MGR-07): APK "TechMenu Quản lý"; không tham số = Thu ngân như cũ.
  const app = docAppAndroid(new URL(req.url).searchParams.get("app"));
  const goc = goiPhatHanhAndroid();
  const ban = await thongTinAndroid({ moi: true, app });
  if (!goc || !ban) {
    return new NextResponse(`Chưa có bản phát hành ${APP_ANDROID[app].ten} cho Android — liên hệ TechMenu.`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (new URL(req.url).searchParams.get("thongTin") === "1") {
    return NextResponse.json(
      { ...ban, duongDan: `/api/android/update/${ban.tenTep}` },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.redirect(`${goc}/${ban.tenTep}`, { status: 302, headers: { "Cache-Control": "no-store" } });
}
