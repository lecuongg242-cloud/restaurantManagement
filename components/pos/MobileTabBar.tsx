"use client";

import { LayoutGrid, ReceiptText, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "ban" | "mon" | "don";

/**
 * Thanh tab dưới cho POS trên ĐIỆN THOẠI (ORDER-20) — dưới 640 px chỉ đủ chỗ cho MỘT cột: Bàn · Thực đơn ·
 * Đơn. Badge ở "Đơn" = số món đang thêm chưa gửi (dễ quên nhất khi đổi tab). Không `fixed`: là phần tử
 * cuối của cột flex nên không che nội dung, và chừa vùng an toàn dưới của iPhone. Từ 640 px ẩn (`sm:hidden`).
 */
export function MobileTabBar({
  tab,
  onTab,
  counter,
}: {
  tab: MobileTab;
  onTab: (t: MobileTab) => void;
  /** Chế độ quầy: không có bàn ⇒ không có tab "Bàn". */
  counter: boolean;
}) {
  const muc: { id: MobileTab; nhan: string; icon: typeof LayoutGrid }[] = [
    ...(counter ? [] : [{ id: "ban" as const, nhan: "Bàn", icon: LayoutGrid }]),
    { id: "mon", nhan: "Thực đơn", icon: UtensilsCrossed },
    { id: "don", nhan: "Đơn", icon: ReceiptText },
  ];

  return (
    <nav
      aria-label="Chuyển màn POS"
      className="flex shrink-0 border-t border-hairline-soft bg-canvas pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {muc.map(({ id, nhan, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTab(id)}
          aria-current={tab === id ? "page" : undefined}
          className={cn(
            "relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-xxs text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
            tab === id ? "text-primary" : "text-steel"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
          {nhan}
        </button>
      ))}
    </nav>
  );
}
