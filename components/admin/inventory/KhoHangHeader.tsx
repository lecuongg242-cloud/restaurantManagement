"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Đầu trang khu "Kho hàng" (P28, chủ dự án chốt 04/10/2026 — gom một mục như Sapo FnB "Tồn kho" / CUKCUK "Kho"): tiêu đề +
 * hàng tab ngang. Dùng chung cho layout Nguyên liệu, Nhập hàng, Nhà cung cấp — đường dẫn giữ nguyên. Thêm tab mới ở đây, một chỗ.
 * `exact`: tab chỉ sáng đúng trang đó (Nguyên liệu = gốc /inventory, các tab khác của /inventory là trang con của nó).
 */
const TABS = [
  { href: "/inventory/stock", label: "Tồn kho" },
  { href: "/nhap-hang", label: "Nhập hàng" },
  { href: "/inventory/count", label: "Kiểm kê & hủy" },
  { href: "/inventory", label: "Nguyên liệu", exact: true },
  { href: "/inventory/recipes", label: "Định lượng món" },
  { href: "/nha-cung-cap", label: "Nhà cung cấp" },
] as const;

/** Mọi đường dẫn thuộc khu kho — sidebar dùng để tô sáng mục "Kho hàng". */
export const KHO_HANG_PREFIXES = ["/inventory", "/nhap-hang", "/nha-cung-cap"] as const;

export function KhoHangHeader({ adminBase }: { adminBase: string }) {
  const pathname = usePathname();
  return (
    <>
      <h1 className="font-semibold text-2xl text-ink">Kho hàng</h1>
      {/* overflow-x-auto: trên điện thoại 360px cuộn ngang TRONG thanh tab, không cuộn trang. */}
      <nav aria-label="Kho hàng" className="-mx-xs mt-md flex gap-sm overflow-x-auto px-xs py-xxs">
        {TABS.map((t) => {
          const href = adminBase + t.href;
          // Trang con (lập phiếu, chi tiết phiếu, chi tiết nhà cung cấp) vẫn giữ tab cha sáng.
          const active = pathname === href || (!("exact" in t) && pathname.startsWith(href + "/"));
          return (
            <Link
              key={t.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // Viên thuốc như tab Sơ đồ bàn / Thực đơn bên POS (chủ dự án chọn 04/10/2026): đang mở nền cam đặc.
                "inline-flex min-h-10 shrink-0 items-center rounded-full border px-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                active ? "border-primary bg-primary text-primary-fg" : "border-hairline-strong bg-canvas text-slate hover:bg-surface"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
