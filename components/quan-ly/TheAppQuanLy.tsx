import { headers } from "next/headers";
import { Smartphone } from "lucide-react";
import { qrSvg } from "@/lib/tables/qr";
import { thongTinAndroid } from "@/lib/android/phat-hanh";
import { Card, CardTitle, CardContent } from "@/components/ui/card";

/**
 * Thẻ "App quản lý trên điện thoại" ở trang Tổng quan admin (P30, MGR-08, Giao diện B1): mã QR trỏ trang tải công khai
 * `/tai-app-quan-ly` (quét bằng điện thoại là ra nút tải Android / hướng dẫn iPhone), nút tải APK, link hướng dẫn iPhone.
 */
export async function TheAppQuanLy() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : (h.get("x-forwarded-proto") ?? "https");
  const trangTai = `${proto}://${host}/tai-app-quan-ly`;
  const [svg, apk] = await Promise.all([qrSvg(trangTai), thongTinAndroid({ app: "quan-ly" })]);

  return (
    <Card className="mt-lg flex flex-wrap items-center gap-lg" data-the-app-quan-ly>
      <div
        className="size-32 shrink-0 rounded-md border border-hairline-soft bg-canvas p-xs [&>svg]:h-full [&>svg]:w-full"
        role="img"
        aria-label={`Mã QR mở ${trangTai}`}
        // SVG do thư viện qrcode sinh từ địa chỉ của chính app — không chứa dữ liệu người dùng.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0 flex-1">
        <CardTitle className="flex items-center gap-xs">
          <Smartphone className="size-5 text-primary" aria-hidden /> App quản lý trên điện thoại
        </CardTitle>
        <CardContent>
          Xem doanh thu, hóa đơn, báo cáo và bật/tắt món hết ngay trên điện thoại. Quét mã QR bằng điện thoại để cài.
        </CardContent>
        <div className="mt-sm flex flex-wrap gap-sm">
          {apk ? (
            <a
              href="/api/android/latest?app=quan-ly"
              className="inline-flex h-11 items-center rounded-md bg-primary px-lg text-sm font-medium text-primary-fg hover:bg-primary-deep"
            >
              Tải cho Android ({(apk.kichThuoc / 1048576).toFixed(1)} MB)
            </a>
          ) : (
            <span className="inline-flex h-11 items-center rounded-md border border-hairline-strong px-lg text-sm text-steel">
              Bản Android sắp có
            </span>
          )}
          <a href="/tai-app-quan-ly#iphone" className="inline-flex h-11 items-center rounded-md border border-hairline-strong px-lg text-sm text-ink hover:bg-surface">
            Hướng dẫn cho iPhone
          </a>
        </div>
      </div>
    </Card>
  );
}
