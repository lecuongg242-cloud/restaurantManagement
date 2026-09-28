import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { thuongHieuQuan } from "@/lib/tenant/thuong-hieu";

export const dynamic = "force-dynamic";

let fontDam: Buffer | null = null;

/**
 * GET /r/[slug]/favicon.png — biểu tượng trên tab trình duyệt của quán. Có logo → chuyển sang ảnh logo
 * (trình duyệt tự thu nhỏ). Chưa có logo → chữ cái đầu tên quán trên nền cam, giống ô avatar ở admin.
 * Đuôi `.png` để middleware bỏ qua (matcher loại trừ ảnh) — không tốn lượt kiểm phiên.
 *
 * `?s=192|512`: biểu tượng khi CÀI lên màn hình chính (P17 17-01, OPS-04) — trình duyệt đòi ảnh vuông đúng cỡ khai
 * trong manifest, nên logo được vẽ vào khung vuông nền trắng thay vì chuyển hướng.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quan = await thuongHieuQuan(slug);
  if (!quan) return new NextResponse(null, { status: 404 });
  const s = Number(new URL(req.url).searchParams.get("s"));
  const co = s === 192 || s === 512 ? s : 64;

  if (quan.logoUrl && co === 64) {
    const r = NextResponse.redirect(new URL(quan.logoUrl, req.url), 302);
    r.headers.set("Cache-Control", "public, max-age=300");
    return r;
  }

  fontDam ??= fs.readFileSync(path.join(process.cwd(), "assets", "fonts", "BeVietnamPro-Bold.ttf"));
  const chu = quan.ten.trim().charAt(0).toUpperCase() || "?";
  const logo = quan.logoUrl ? new URL(quan.logoUrl, req.url).toString() : null;
  const anh = new ImageResponse(
    logo ? (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse chỉ nhận <img> */}
        <img src={logo} alt="" width={Math.round(co * 0.8)} height={Math.round(co * 0.8)} style={{ objectFit: "contain" }} />
      </div>
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fa520f",
          color: "#ffffff",
          borderRadius: co === 64 ? 14 : 0,
          fontFamily: "BVP",
          fontSize: Math.round(co * 0.69),
          fontWeight: 700,
        }}
      >
        {chu}
      </div>
    ),
    { width: co, height: co, fonts: [{ name: "BVP", data: fontDam, weight: 700 }] }
  );
  anh.headers.set("Cache-Control", "public, max-age=3600");
  return anh;
}
