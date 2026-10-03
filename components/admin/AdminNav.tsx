"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, Contact, LayoutDashboard, Package, QrCode, Settings, UtensilsCrossed, Users, Wallet, type LucideIcon, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { canManage, type ManageSection } from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/session";
import { KHO_HANG_PREFIXES } from "@/components/admin/inventory/KhoHangHeader";

type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  section?: ManageSection;
  /** Mục gom nhiều khu (Kho hàng): sáng khi pathname nằm dưới một trong các tiền tố này (sau `base`). */
  match?: readonly string[];
  /** Nhóm "Thiết lập": khai một lần hoặc thỉnh thoảng sửa — nằm dưới, có tiêu đề nhóm. */
  setup?: true;
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
  // Thứ tự theo tần suất dùng (chủ dự án 04/10/2026: "báo cáo hay vào thì cho lên trên, bàn và QR setup 1 lần thì cho xuống
  // dưới"). Trên: việc hằng ngày — xem số, nhập / kiểm kho, thu chi. Dưới, nhóm "Thiết lập": khai một lần, thỉnh thoảng sửa.
  const allItems: NavItem[] = [
    { key: "dashboard", label: "Tổng quan", icon: LayoutDashboard, href: base },
    { key: "reports", label: "Báo cáo", icon: BarChart3, href: `${base}/reports`, section: "reports" },
    // P28 (04/10/2026): Nguyên liệu + Nhập hàng + Nhà cung cấp gom một mục, bên trong là tab ngang. Bấm → Tồn kho.
    { key: "inventory", label: "Kho hàng", icon: Package, href: `${base}/inventory/stock`, section: "inventory", match: KHO_HANG_PREFIXES },
    { key: "cashbook", label: "Sổ quỹ", icon: Wallet, href: `${base}/so-quy`, section: "cashbook" },
    { key: "customers", label: "Khách hàng", icon: Contact, href: `${base}/khach-hang`, section: "customers" },
    { key: "menu", label: "Thực đơn", icon: UtensilsCrossed, href: `${base}/menu`, section: "menu", setup: true },
    { key: "staff", label: "Nhân viên", icon: Users, href: `${base}/staff`, section: "staff", setup: true },
    { key: "tables", label: "Bàn & QR", icon: QrCode, href: `${base}/tables`, section: "tables", setup: true },
    { key: "printers", label: "Máy in", icon: Printer, href: `${base}/printers`, section: "printers", setup: true },
    { key: "branches", label: "Chi nhánh", icon: Building2, href: `${base}/chi-nhanh`, section: "branches", setup: true },
    { key: "settings", label: "Cài đặt", icon: Settings, href: `${base}/settings`, section: "settings", setup: true },
  ];
  const items = allItems.filter((item) => !item.section || canManage(role, item.section));

  const isActive = (href?: string, match?: readonly string[]) => {
    if (!href) return false;
    if (match) return match.some((p) => pathname === base + p || pathname.startsWith(base + p + "/"));
    if (href === base) return pathname === base;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="flex flex-1 flex-col gap-xxs overflow-y-auto p-sm">
      {items.map((item, i) => {
        const Icon = item.icon;
        const dauNhom = item.setup && !items[i - 1]?.setup;
        return item.href ? (
          <Fragment key={item.key}>
            {dauNhom && (
              <p className="mt-xs border-t border-hairline-soft px-md pb-xxs pt-sm text-xs font-medium uppercase tracking-wide text-stone">
                Thiết lập
              </p>
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive(item.href, item.match) ? "page" : undefined}
              className={cn(
                // min-h-11 = 44px: mục nav trong drawer mobile cũng là vùng chạm AA.
                "flex min-h-11 items-center gap-sm rounded-md px-md py-sm text-sm text-slate transition-colors duration-150 motion-reduce:transition-none hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
                isActive(item.href, item.match) && "bg-cream font-medium text-ink"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive(item.href, item.match) ? "text-primary" : "text-steel"
                )}
                aria-hidden
              />
              {item.label}
            </Link>
          </Fragment>
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
