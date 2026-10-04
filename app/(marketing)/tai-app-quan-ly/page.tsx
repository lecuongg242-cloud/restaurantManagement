import type { Metadata } from "next";
import Link from "next/link";
import { thongTinAndroid } from "@/lib/android/phat-hanh";
import { QUAN_LY_METADATA } from "@/lib/quan-ly/metadata";

export const metadata: Metadata = {
  ...QUAN_LY_METADATA,
  title: "Tải app TechMenu Quản lý",
  description: "App cho chủ quán và quản lý: doanh thu, hóa đơn, báo cáo, bật/tắt món hết ngay trên điện thoại Android và iPhone.",
};

/** Bản phát hành đổi thì trang tự cập nhật sau tối đa 5 phút (cùng nhịp đệm của `thongTinAndroid`). */
export const revalidate = 300;

/**
 * Trang tải app "TechMenu Quản lý" (P30, MGR-08, Giao diện B1) — đích của mã QR ở trang Tổng quan admin. Công khai (chưa
 * đăng nhập vẫn xem được): Android tải APK + 3 bước cho phép cài; iPhone 3 bước "Thêm vào MH chính" (QD-033 D2 — không
 * lên App Store). Người đọc: chủ quán, không rành công nghệ ⇒ chữ to, từng bước đánh số.
 */
export default async function TaiAppQuanLy() {
  const apk = await thongTinAndroid({ app: "quan-ly" });
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[560px] px-md py-xl">
        <div className="flex items-center gap-sm">
          <span aria-hidden className="grid size-12 place-items-center rounded-md bg-ink font-display text-2xl font-bold text-primary">
            T
          </span>
          <h1 className="font-display text-3xl text-ink">TechMenu Quản lý</h1>
        </div>
        <p className="mt-md text-lg leading-relaxed text-slate">
          Xem doanh thu, hóa đơn, báo cáo và bật/tắt món hết của quán ngay trên điện thoại. Dành cho chủ quán và quản lý.
        </p>

        <section id="android" className="mt-xl rounded-lg border border-hairline-soft p-lg">
          <h2 className="font-display text-2xl text-ink">Điện thoại Android</h2>
          {apk ? (
            <a
              href="/api/android/latest?app=quan-ly"
              className="mt-md inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-lg text-base font-medium text-primary-fg"
            >
              Tải cho Android ({(apk.kichThuoc / 1048576).toFixed(1)} MB)
            </a>
          ) : (
            <p className="mt-md rounded-md bg-cream-soft p-md text-base text-slate">Bản Android sắp có. Trong lúc chờ, dùng bản web bên dưới.</p>
          )}
          <ol className="mt-md list-decimal space-y-xs pl-lg text-base text-ink">
            <li>Bấm nút tải ở trên, mở tệp vừa tải.</li>
            <li>
              Nếu máy hỏi, bật <strong>“Cho phép cài ứng dụng từ nguồn này”</strong> rồi quay lại.
            </li>
            <li>
              Nếu Play Protect cảnh báo, bấm <strong>“Vẫn cài đặt”</strong>. Mở app, đăng nhập bằng email của chủ quán.
            </li>
          </ol>
        </section>

        <section id="iphone" className="mt-lg rounded-lg border border-hairline-soft p-lg">
          <h2 className="font-display text-2xl text-ink">iPhone</h2>
          <ol className="mt-md list-decimal space-y-xs pl-lg text-base text-ink">
            <li>
              Mở{" "}
              <Link href="/quan-ly" className="font-medium text-primary underline-offset-4 hover:underline">
                trang Quản lý
              </Link>{" "}
              bằng <strong>Safari</strong>.
            </li>
            <li>
              Bấm nút <strong>Chia sẻ</strong> (ô vuông có mũi tên lên) ở thanh dưới.
            </li>
            <li>
              Chọn <strong>“Thêm vào MH chính”</strong> → <strong>Thêm</strong>. Biểu tượng “TM Quản lý” sẽ có trên màn hình chính.
            </li>
          </ol>
        </section>

        <p className="mt-lg text-center text-base">
          <Link href="/quan-ly" className="text-primary underline-offset-4 hover:underline">
            Hoặc mở bản web ngay →
          </Link>
        </p>
      </div>
    </main>
  );
}
