import Link from "next/link";

/**
 * Màn hiện thay cho mọi bề mặt của quán đã quá hạn dùng + ân hạn (SUB-03, QD-021 D7). Khác "Tạm ngưng":
 * đây là việc chủ quán TỰ gỡ được ⇒ có lối vào trang Gia hạn (qua đăng nhập) và số liên hệ. Dữ liệu còn
 * nguyên; gia hạn xong là mở lại ngay.
 */
export function TenantExpired({ slug, supportPhone }: { slug: string; supportPhone: string | null }) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-lg">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl text-ink">Hết hạn sử dụng</h1>
        <p className="mt-sm text-sm text-slate">
          Gói sử dụng phần mềm của nhà hàng này đã hết hạn. Dữ liệu vẫn được giữ nguyên và mở lại ngay khi gia hạn.
        </p>
        <p className="mt-md text-sm text-slate">
          Chủ nhà hàng:{" "}
          <Link href={`/r/${slug}/admin/gia-han`} className="font-medium text-primary underline-offset-4 hover:underline">
            đăng nhập để gia hạn
          </Link>
          .
        </p>
        {supportPhone && (
          <p className="mt-xs text-sm text-steel">
            Hỗ trợ:{" "}
            <a href={`tel:${supportPhone.replace(/\s/g, "")}`} className="text-ink underline-offset-4 hover:underline">
              {supportPhone}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
