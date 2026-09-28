"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, Building2, LayoutDashboard, Megaphone, Plus, Printer, Settings, Store, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mục menu super-admin — MỘT nguồn cho sidebar desktop và drawer điện thoại. */
export const SUPER_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/super", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/super/nha-hang", label: "Nhà hàng", icon: Store },
  { href: "/super/thuong-hieu", label: "Thương hiệu", icon: Building2 },
  { href: "/super/thue-bao", label: "Thuê bao", icon: CalendarClock },
  { href: "/super/cau-in", label: "Cầu in", icon: Printer },
  { href: "/super/leads", label: "Khách quan tâm", icon: Megaphone },
  { href: "/super/new", label: "Tạo nhà hàng", icon: Plus },
  { href: "/super/cai-dat", label: "Cài đặt nền tảng", icon: Settings },
];

export function SuperNav({ badges, onNavigate }: { badges?: Record<string, number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/super" ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav className="flex flex-1 flex-col gap-xxs overflow-y-auto p-sm" aria-label="Quản trị hệ thống">
      {SUPER_NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        const badge = badges?.[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-sm rounded-md px-md py-sm text-sm text-slate transition-colors duration-150 motion-reduce:transition-none hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              active && "bg-cream font-medium text-ink"
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-steel")} aria-hidden />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="rounded-full bg-status-late px-xs text-xs font-medium tabular-nums text-status-late-fg">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
