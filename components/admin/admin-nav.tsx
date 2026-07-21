"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { seg: "", label: "Tổng quan", dot: "bg-id-admin" },
  { seg: "/menu", label: "Menu", dot: "bg-id-customer" },
  { seg: "/tables", label: "Khu vực & bàn", dot: "bg-id-pos" },
  { seg: "/staff", label: "Nhân viên", dot: "bg-id-admin" },
  { seg: "/onboarding", label: "Thiết lập", dot: "bg-id-online" },
] as const;

/**
 * Điều hướng khu quản trị: sidebar trái (desktop) / thanh ngang dính (mobile).
 * `no-print` để không lọt vào bản in QR.
 */
export function AdminNav({
  slug,
  tenantName,
}: {
  slug: string;
  tenantName: string;
}) {
  const pathname = usePathname();
  const base = `/r/${slug}/admin`;
  const isActive = (seg: string) =>
    seg === "" ? pathname === base : pathname.startsWith(base + seg);

  const itemCls = (active: boolean) =>
    `flex min-h-11 items-center gap-2.5 rounded-full px-4 text-sm transition-colors duration-200 ${
      active
        ? "bg-surface font-semibold"
        : "font-medium text-muted hover:bg-surface/60 hover:text-foreground"
    }`;

  return (
    <>
      {/* Desktop: sidebar trái dính */}
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-border-soft p-4 md:flex">
        <Link
          href={base}
          className="mb-4 flex items-center gap-2 px-2 pt-2"
          title="Về tổng quan"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-id-admin" />
          <span className="truncate text-lg font-bold tracking-tight">
            {tenantName}
          </span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Quản trị">
          {ITEMS.map((it) => {
            const active = isActive(it.seg);
            return (
              <Link
                key={it.seg}
                href={base + it.seg}
                aria-current={active ? "page" : undefined}
                className={itemCls(active)}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${it.dot}`} />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <a
          href={`/r/${slug}`}
          target="_blank"
          rel="noopener"
          className="mt-auto flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold transition-colors duration-200 hover:border-foreground"
        >
          Xem menu như khách ↗
        </a>
      </aside>

      {/* Mobile: thanh ngang dính, cuộn được */}
      <nav
        aria-label="Quản trị"
        className="no-print sticky top-0 z-20 border-b border-border-soft bg-background/95 backdrop-blur md:hidden"
      >
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
          {ITEMS.map((it) => {
            const active = isActive(it.seg);
            return (
              <Link
                key={it.seg}
                href={base + it.seg}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] transition-colors duration-200 ${
                  active
                    ? "border-foreground bg-surface font-semibold"
                    : "border-border font-medium text-muted hover:text-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${it.dot}`} />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
