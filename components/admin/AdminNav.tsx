"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutDashboard, QrCode, Settings, UtensilsCrossed, Users, type LucideIcon, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { canManage, type ManageSection } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/session";

type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  section?: ManageSection;
};

/**
 * Sidebar nav (client) — tự tô đậm mục đang mở theo pathname.
 * Mục không có quyền bị ẨN HẲN (AUTH-05), và quyền lấy TỪ `canManage` — không chép tay danh
 * sách vai trò ở đây, để nav và guard trang không bao giờ lệch nhau.
 *
 * Dùng chung cho sidebar desktop và drawer mobile (AdminMobileNav): `onNavigate` để drawer tự
 * đóng sau khi chọn mục — desktop không truyền thì không có gì xảy ra.
 */
export function AdminNav({
  base,
  role,
  onNavigate,
}: {
  base: string;
  role: Role;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const allItems: NavItem[] = [
    { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard, href: base },
    { key: "staff", label: "Nhân viên", icon: Users, href: `${base}/staff`, section: "staff" },
    { key: "menu", label: "Thực đơn", icon: UtensilsCrossed, href: `${base}/menu`, section: "menu" },
    { key: "tables", label: "Bàn & QR", icon: QrCode, href: `${base}/tables`, section: "tables" },
    { key: "reports", label: "Báo cáo", icon: BarChart3, href: `${base}/reports`, section: "reports" },
    { key: "printers", label: "Máy in", icon: Printer, href: `${base}/printers`, section: "printers" },
    { key: "settings", label: "Cài đặt", icon: Settings, href: `${base}/settings`, section: "settings" },
  ];
  const items = allItems.filter((item) => !item.section || canManage(role, item.section));

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === base) return pathname === base;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="flex flex-1 flex-col gap-xxs overflow-y-auto p-sm">
      {items.map((item) => {
        const Icon = item.icon;
        return item.href ? (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              // min-h-11 = 44px: mục nav trong drawer mobile cũng là vùng chạm AA.
              "flex min-h-11 items-center gap-sm rounded-md px-md py-sm text-sm text-slate transition-colors duration-150 motion-reduce:transition-none hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              isActive(item.href) && "bg-cream font-medium text-ink"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                isActive(item.href) ? "text-primary" : "text-steel"
              )}
              aria-hidden
            />
            {item.label}
          </Link>
        ) : (
          <span
            key={item.key}
            className="flex min-h-11 items-center gap-sm rounded-md px-md py-sm text-sm text-muted"
            title="Sắp có ở plan sau"
          >
            <Icon className="h-4 w-4 shrink-0 text-stone" aria-hidden />
            <span className="flex-1">{item.label}</span>
            <span className="text-[10px] uppercase tracking-wide text-stone">chờ</span>
          </span>
        );
      })}
    </nav>
  );
}
