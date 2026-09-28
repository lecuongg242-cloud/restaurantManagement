import { NextResponse, type NextRequest } from "next/server";
import { thuongHieuQuan } from "@/lib/tenant/thuong-hieu";

export const dynamic = "force-dynamic";

const BE_MAT = {
  pos: { ten: "POS", duong: "pos" },
  kds: { ten: "Bếp", duong: "kds" },
  admin: { ten: "Quản lý", duong: "admin" },
} as const;

/**
 * Manifest để CÀI POS / KDS / admin lên màn hình chính (P17 17-01, OPS-04): mở toàn màn, tên + biểu tượng quán.
 * Mỗi bề mặt một manifest (`?app=`) để biểu tượng mở đúng màn; phạm vi là cả `/r/{slug}/` để đi giữa các màn của
 * quán không bật ra trình duyệt. Trang khách không gắn manifest — khách không cài.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quan = await thuongHieuQuan(slug);
  if (!quan) return new NextResponse(null, { status: 404 });
  const k = req.nextUrl.searchParams.get("app");
  const b = BE_MAT[k === "kds" || k === "admin" ? k : "pos"];
  const icon = (s: number) => ({ src: `/r/${slug}/favicon.png?s=${s}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" });
  return NextResponse.json(
    {
      id: `/r/${slug}/${b.duong}`,
      name: `${quan.ten} · ${b.ten}`,
      // Chữ dưới biểu tượng: phần phân biệt (POS / Bếp / Quản lý) đứng trước — màn hình chính cắt đuôi tên dài.
      short_name: `${b.ten} ${quan.ten}`,
      start_url: `/r/${slug}/${b.duong}`,
      scope: `/r/${slug}/`,
      display: "standalone",
      orientation: "any",
      background_color: "#ffffff",
      theme_color: "#fa520f",
      lang: "vi",
      icons: [icon(192), icon(512)],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } }
  );
}
