"use client";

import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { duongDanChiNhanh } from "@/lib/brand/path";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn chi nhánh (P15 15-02, QD-023 D3) — header admin và POS. Chỉ hiện khi người dùng vào được ≥ 2 chi
 * nhánh cùng thương hiệu (server quyết định, xem `boChonChiNhanh`). Chọn → cùng trang ở chi nhánh kia.
 *
 * Tải lại CẢ trang (không điều hướng mềm): kênh realtime, giỏ món, bộ đếm đều gắn với chi nhánh cũ — tải lại là
 * cách chắc chắn nhất để không còn gì của chi nhánh cũ sót lại (PERF-04). POS hỏi trước vì món chưa gửi bếp
 * không đi theo.
 */
export function BranchSwitcher({
  slug,
  branches,
  brandSlug,
  pos = false,
  className,
}: {
  slug: string;
  branches: { slug: string; name: string }[];
  brandSlug: string | null;
  pos?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <label className={cn("flex min-w-0 items-center gap-xxs", className)}>
      <Store className="h-4 w-4 shrink-0 text-steel" aria-hidden />
      <span className="sr-only">Chi nhánh</span>
      <select
        value={slug}
        data-branch-switcher
        onChange={(e) => {
          const v = e.target.value;
          if (v === slug) return;
          if (pos && !confirm("Chuyển sang chi nhánh khác? Món đang chọn chưa gửi bếp sẽ không mang theo.")) {
            e.target.value = slug;
            return;
          }
          window.location.assign(v === "__chuoi" ? `/r/${slug}/admin/chi-nhanh` : duongDanChiNhanh(pathname, slug, v));
        }}
        className={cn(
          "h-9 min-w-0 truncate rounded-md border border-hairline-strong bg-canvas px-xs text-sm text-ink sm:max-w-[16rem]",
          // POS điện thoại: chừa chỗ cho tên nhân viên đang thao tác.
          pos ? "max-w-[8.5rem]" : "max-w-[11rem]"
        )}
      >
        {branches.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
        {brandSlug && !pos && <option value="__chuoi">— Tổng quan chuỗi —</option>}
      </select>
    </label>
  );
}
