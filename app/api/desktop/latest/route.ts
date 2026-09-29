import { NextResponse } from "next/server";
import { goiPhatHanh, thongTinApp } from "@/lib/desktop/phat-hanh";

export const dynamic = "force-dynamic";

/**
 * GET /api/desktop/latest — tải bộ cài "TechMenu Thu ngân" mới nhất (DESK-11). Link cố định cho nút ở Admin → Máy in,
 * trang /huong-dan-cai-dat và tài liệu bàn giao — đổi nơi đặt tệp không phải sửa link nào.
 */
export async function GET() {
  const goc = goiPhatHanh();
  const ban = await thongTinApp({ moi: true });
  if (!goc || !ban) {
    return new NextResponse("Chưa có bản phát hành TechMenu Thu ngân — liên hệ TechMenu.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.redirect(`${goc}/${ban.tenTep}`, { status: 302, headers: { "Cache-Control": "no-store" } });
}
