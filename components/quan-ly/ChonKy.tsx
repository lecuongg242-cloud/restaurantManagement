import Link from "next/link";
import { KY, type Ky } from "@/lib/quan-ly/ky";
import { cn } from "@/lib/utils";

/**
 * Ô chọn kỳ của app Quản lý (Giao diện B4): Hôm nay · Hôm qua · 7 ngày qua · Tháng này · Tháng trước — hàng chip cuộn
 * ngang (điện thoại hẹp). `them` giữ tham số khác của trang (tìm kiếm, phạm vi chuỗi).
 */
export function ChonKy({ base, ky, them = {} }: { base: string; ky: Ky; them?: Record<string, string | undefined> }) {
  return (
    <nav aria-label="Kỳ xem" className="-mx-md flex gap-xs overflow-x-auto px-md pb-xxs [scrollbar-width:none]">
      {KY.map((k) => {
        const thamSo: Record<string, string | undefined> = { ...them, ky: k.ma === "hom-nay" ? undefined : k.ma };
        const q = new URLSearchParams(Object.entries(thamSo).filter((e): e is [string, string] => !!e[1]));
        const bat = k.ma === ky.ma;
        return (
          <Link
            key={k.ma}
            href={q.size ? `${base}?${q}` : base}
            aria-current={bat ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center rounded-full border px-md text-sm",
              bat ? "border-ink bg-ink text-canvas" : "border-hairline-strong bg-canvas text-slate"
            )}
          >
            {k.chu}
          </Link>
        );
      })}
    </nav>
  );
}
