import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

let fontDam: Buffer | null = null;

/**
 * GET /quan-ly/bieu-tuong.png?s=180|192|512 — biểu tượng app "TechMenu Quản lý" (P30, Giao diện B11): cùng chữ T của
 * TechMenu nhưng NỀN TỐI để khác app Thu ngân (nền cam) trên màn hình chính. Đuôi `.png` ⇒ middleware bỏ qua.
 */
export async function GET(req: Request) {
  const s = Number(new URL(req.url).searchParams.get("s"));
  const co = s === 180 || s === 192 || s === 512 ? s : 64;
  fontDam ??= fs.readFileSync(path.join(process.cwd(), "assets", "fonts", "BeVietnamPro-Bold.ttf"));
  const anh = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f1f1f",
          color: "#fa520f",
          borderRadius: co === 64 ? 14 : 0,
          fontFamily: "BVP",
          fontSize: Math.round(co * 0.62),
          fontWeight: 700,
        }}
      >
        T
      </div>
    ),
    { width: co, height: co, fonts: [{ name: "BVP", data: fontDam, weight: 700 }] }
  );
  anh.headers.set("Cache-Control", "public, max-age=86400");
  return anh;
}
