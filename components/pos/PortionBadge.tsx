import { X } from "lucide-react";
import { portionBadge } from "@/lib/inventory/portions";
import { cn } from "@/lib/utils";

/**
 * Nhãn số phần ước tính (INV-07). Chỉ để BÁO — không bao giờ chặn thêm món (QD-017 C2).
 * Vàng = token `status-new` (cùng màu chip "chờ duyệt"): cần để ý, chưa phải lỗi.
 * Có `onHide` thì nhãn vàng kèm nút ✕ (ẩn tới hết ngày — xem `lib/inventory/hidden-warnings.ts`).
 */
export function PortionBadge({
  portions,
  className,
  onHide,
}: {
  portions: number | undefined;
  className?: string;
  onHide?: () => void;
}) {
  const b = portionBadge(portions);
  if (b.tone === "none") return null;
  const hideable = b.tone === "warning" && onHide;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-xxs rounded px-xs py-[1px] text-xs font-medium",
        b.tone === "warning" ? "bg-status-new text-status-new-fg" : "bg-surface text-steel",
        hideable && "pr-0",
        className
      )}
    >
      {b.text}
      {hideable && (
        <button
          type="button"
          onClick={onHide}
          aria-label="Ẩn cảnh báo tới hết ngày"
          title="Ẩn cảnh báo tới hết ngày"
          className="pointer-events-auto -my-1 grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}
