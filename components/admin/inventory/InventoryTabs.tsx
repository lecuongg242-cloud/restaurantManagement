"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Các tab trong khu Nguyên liệu (P10). Thêm tab mới ở đây, một chỗ. */
const TABS = [
  { href: "/today", label: "Nhập hôm nay" },
  { href: "", label: "Nguyên liệu" },
  { href: "/recipes", label: "Định lượng món" },
] as const;

export function InventoryTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    // overflow-x-auto: đủ tab thì trên điện thoại 360px cuộn ngang TRONG thanh tab, không cuộn trang.
    <nav aria-label="Khu nguyên liệu" className="-mx-xs mt-md flex gap-xs overflow-x-auto px-xs">
      {TABS.map((t) => {
        const href = base + t.href;
        const active = pathname === href;
        return (
          <Link
            key={t.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-md px-md text-sm transition-colors",
              active ? "bg-cream font-medium text-ink" : "text-steel hover:bg-surface"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
