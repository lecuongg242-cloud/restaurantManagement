import { portionBadge } from "@/lib/inventory/portions";
import { cn } from "@/lib/utils";

/**
 * Nhãn số phần ước tính (INV-07). Chỉ để BÁO — không bao giờ chặn thêm món (QD-017 C2).
 * Vàng = token `status-new` (cùng màu chip "chờ duyệt"): cần để ý, chưa phải lỗi.
 */
export function PortionBadge({ portions, className }: { portions: number | undefined; className?: string }) {
  const b = portionBadge(portions);
  if (b.tone === "none") return null;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded px-xs py-[1px] text-xs font-medium",
        b.tone === "warning" ? "bg-status-new text-status-new-fg" : "bg-surface text-steel",
        className
      )}
    >
      {b.text}
    </span>
  );
}
