import type { SubscriptionState } from "@/lib/tenant/subscription";
import { cn } from "@/lib/utils";

/** Nhãn hạn dùng (13-03) — dùng ở bảng Nhà hàng và Thuê bao. */
const HAN: Record<SubscriptionState, { chu: string; lop: string }> = {
  unlimited: { chu: "không giới hạn", lop: "bg-surface text-slate" },
  ok: { chu: "còn hạn", lop: "bg-surface text-slate" },
  due_soon: { chu: "sắp hết hạn", lop: "bg-status-new text-status-new-fg" },
  grace: { chu: "quá hạn · ân hạn", lop: "bg-status-late text-status-late-fg" },
  locked: { chu: "HẾT HẠN · đã khóa", lop: "bg-status-late text-status-late-fg" },
};

/** Không giới hạn: không vẽ chip — cột đã ghi "Không giới hạn". */
export function HanDungChip({ han }: { han: SubscriptionState }) {
  if (han === "unlimited") return null;
  return (
    <span className={cn("mt-xxs inline-block rounded-full px-xs py-[2px] text-xs", HAN[han].lop)} data-han-dung={han}>
      {HAN[han].chu}
    </span>
  );
}
