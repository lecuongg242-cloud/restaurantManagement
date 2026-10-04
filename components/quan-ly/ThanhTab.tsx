"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, LayoutDashboard, MoreHorizontal, Receipt, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const TAB = [
  { duong: "", chu: "Tổng quan", Icon: LayoutDashboard },
  { duong: "/hoa-don", chu: "Hóa đơn", Icon: Receipt },
  { duong: "/bao-cao", chu: "Báo cáo", Icon: BarChart3 },
  { duong: "/thuc-don", chu: "Thực đơn", Icon: UtensilsCrossed },
  { duong: "/them", chu: "Thêm", Icon: MoreHorizontal },
] as const;

/**
 * Thanh 5 tab cố định ở đáy (P30, Giao diện B4 — chốt 04/10/2026), như thanh dưới của KiotViet / Sapo. Giữ kỳ đang xem
 * (`?ky=`) khi đổi tab Tổng quan ↔ Hóa đơn ↔ Báo cáo. Chừa vùng an toàn đáy của iPhone.
 */
export function ThanhTab({ slug }: { slug: string }) {
  const path = usePathname();
  const sp = useSearchParams();
  const goc = `/r/${slug}/quan-ly`;
  const ky = sp.get("ky");
  return (
    <nav
      aria-label="Các mục của app Quản lý"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline-soft bg-canvas pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-[480px] grid-cols-5">
        {TAB.map(({ duong, chu, Icon }) => {
          const href = goc + duong;
          const bat = duong ? path.startsWith(href) : path === goc;
          const giuKy = ky && duong !== "/thuc-don" && duong !== "/them" ? `?ky=${ky}` : "";
          return (
            <li key={chu}>
              <Link
                href={href + giuKy}
                aria-current={bat ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-[2px] text-[11px]", bat ? "font-medium text-primary-deep" : "text-steel")}
              >
                <Icon className="size-5" aria-hidden />
                {chu}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
