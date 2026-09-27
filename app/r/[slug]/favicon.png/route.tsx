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
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quan = await thuongHieuQuan(slug);
  if (!quan) return new NextResponse(null, { status: 404 });

  if (quan.logoUrl) {
    const r = NextResponse.redirect(new URL(quan.logoUrl, req.url), 302);
    r.headers.set("Cache-Control", "public, max-age=300");
    return r;
  }

  fontDam ??= fs.readFileSync(path.join(process.cwd(), "assets", "fonts", "BeVietnamPro-Bold.ttf"));
  const chu = quan.ten.trim().charAt(0).toUpperCase() || "?";
  const anh = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fa520f",
          color: "#ffffff",
          borderRadius: 14,
          fontFamily: "BVP",
          fontSize: 44,
          fontWeight: 700,
        }}
      >
        {chu}
      </div>
    ),
    { width: 64, height: 64, fonts: [{ name: "BVP", data: fontDam, weight: 700 }] }
  );
  anh.headers.set("Cache-Control", "public, max-age=3600");
  return anh;
}
