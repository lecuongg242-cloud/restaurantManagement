import { NextResponse } from "next/server";

/**
 * Manifest "TechMenu Quản lý" (P30, MGR-06): iPhone "Thêm vào MH chính" / Android "Cài ứng dụng" ra biểu tượng RIÊNG,
 * mở toàn màn hình vào `/quan-ly`. Phạm vi `/` vì app đi qua `/quan-ly` → `/r/{slug}/quan-ly` → trang admin đầy đủ
 * (tab "Thêm") mà không bật ra trình duyệt. Không dùng manifest của `/r/[slug]` (P17) — biểu tượng đó mở POS/admin.
 */
export function GET() {
  const icon = (s: number) => ({ src: `/quan-ly/bieu-tuong.png?s=${s}`, sizes: `${s}x${s}`, type: "image/png", purpose: "any" });
  return NextResponse.json(
    {
      id: "/quan-ly",
      name: "TechMenu Quản lý",
      short_name: "TM Quản lý",
      description: "Doanh thu, hóa đơn, báo cáo và thực đơn của quán trên điện thoại.",
      start_url: "/quan-ly",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#1f1f1f",
      lang: "vi",
      icons: [icon(192), icon(512)],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } }
  );
}
