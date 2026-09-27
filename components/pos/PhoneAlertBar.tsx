"use client";

import { useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { BellRing, Check, Hand, Loader2, Printer, X } from "lucide-react";
import { gioVn } from "@/lib/time/vn";
import { cn } from "@/lib/utils";

type DonCanIn = { id: string; tableName: string; kitchenNo: number | null; itemCount: number; created_at: string };
type BanGoi = { id: string; tableName: string; note: string | null };

/**
 * Điện thoại (< 640px): ba băng "Chờ duyệt / Cần in phiếu / Bàn đang gọi" gộp thành MỘT hàng nút gọn. Ba
 * băng chip cuộn ngang như máy quầy ăn hơn 200px chiều cao, lộ thanh cuộn, nút bị cắt ở mép. Bấm nút mở
 * danh sách từ đáy màn — cùng hành động như chip trên băng (in phiếu bếp / đánh dấu đã xử lý).
 */
export function PhoneAlertBar({
  pendingCount,
  onOpenPending,
  unprinted,
  printingId,
  onPrint,
  calls,
  resolvingId,
  onResolve,
  callError,
  always = false,
  trailing,
}: {
  pendingCount: number;
  onOpenPending: () => void;
  unprinted: DonCanIn[];
  printingId: string | null;
  onPrint: (orderId: string) => void;
  calls: BanGoi[];
  resolvingId: string | null;
  onResolve: (callId: string) => void;
  callError: string | null;
  /** Chế độ quầy: hàng này THAY hàng công cụ trên điện thoại, nên hiện cả khi không có gì cần xử lý. */
  always?: boolean;
  /** Nút công cụ dời từ hàng trên xuống (chip máy in, Đơn online) — nằm cuối hàng. */
  trailing?: ReactNode;
}) {
  const [mo, setMo] = useState<"in" | "goi" | null>(null);
  const coViec = pendingCount > 0 || unprinted.length > 0 || calls.length > 0;
  if (!coViec && !always) return null;

  // Nhãn ngắn ("Duyệt", "Gọi") + không xuống dòng: ba nút + nút công cụ trên 440px mỗi nút chỉ ~110px, nhãn
  // dài bị bẻ đôi. Dưới 400px chỉ icon + số; tên đầy đủ nằm ở aria-label.
  const nut =
    "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-xs whitespace-nowrap rounded-md border px-sm text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const chu = "max-[400px]:hidden";

  return (
    <div className="flex items-center gap-xs border-b border-hairline-soft bg-canvas px-md py-xs sm:hidden">
      {pendingCount > 0 && (
        <button
          type="button"
          onClick={onOpenPending}
          aria-label={`Chờ duyệt ${pendingCount}`}
          className={cn(nut, "border-primary bg-cream-deeper")}
        >
          <BellRing className="h-4 w-4 shrink-0 animate-pulse text-primary" aria-hidden />
          <span className={chu}>Duyệt</span> {pendingCount}
        </button>
      )}
      {unprinted.length > 0 && (
        <button
          type="button"
          onClick={() => setMo("in")}
          aria-label={`Cần in ${unprinted.length}`}
          className={cn(nut, "border-status-late bg-cream-soft")}
        >
          <Printer className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
          <span className={chu}>Cần in</span> {unprinted.length}
        </button>
      )}
      {calls.length > 0 && (
        <button
          type="button"
          onClick={() => setMo("goi")}
          aria-label={`Bàn gọi ${calls.length}`}
          className={cn(nut, "border-primary/40 bg-cream")}
        >
          <Hand className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className={chu}>Gọi</span> {calls.length}
        </button>
      )}
      {trailing && <div className="ml-auto flex shrink-0 items-center gap-xs">{trailing}</div>}

      {/* Danh sách hết (in xong / xử lý xong hết) → tự đóng, không để lại ngăn kéo rỗng. */}
      <Drawer.Root
        open={(mo === "in" && unprinted.length > 0) || (mo === "goi" && calls.length > 0)}
        onOpenChange={(v) => !v && setMo(null)}
        repositionInputs={false}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-xl bg-canvas pb-[env(safe-area-inset-bottom)] shadow-modal outline-none">
            <div className="flex items-center justify-between border-b border-hairline-soft px-md py-sm">
              <Drawer.Title className="font-display text-lg text-ink">
                {mo === "in" ? `Đơn cần in phiếu (${unprinted.length})` : `Bàn đang gọi (${calls.length})`}
              </Drawer.Title>
              <Drawer.Description className="sr-only">
                {mo === "in" ? "Chạm một đơn để in phiếu bếp" : "Chạm một bàn để đánh dấu đã xử lý"}
              </Drawer.Description>
              <Drawer.Close asChild>
                <button
                  type="button"
                  aria-label="Đóng"
                  className="grid h-11 w-11 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X className="h-5 w-5" />
                </button>
              </Drawer.Close>
            </div>
            <ul className="flex flex-col gap-xs overflow-y-auto p-md">
              {mo === "in" &&
                unprinted.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => onPrint(u.id)}
                      disabled={printingId === u.id}
                      className="flex min-h-[52px] w-full items-center gap-sm rounded-md border border-status-late/40 bg-canvas px-md text-left text-sm text-ink hover:bg-status-late/5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {printingId === u.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-status-late" aria-hidden />
                      ) : (
                        <Printer className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
                      )}
                      <span className="font-semibold">Bàn {u.tableName}</span>
                      {u.kitchenNo != null && <span className="text-steel">#{u.kitchenNo}</span>}
                      <span className="text-slate">{u.itemCount} món</span>
                      <span className="ml-auto tabular-nums text-steel">{gioVn(u.created_at)}</span>
                    </button>
                  </li>
                ))}
              {mo === "goi" &&
                calls.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onResolve(c.id)}
                      disabled={resolvingId === c.id}
                      className="flex min-h-[52px] w-full items-center gap-sm rounded-md border border-primary/30 bg-canvas px-md text-left text-sm text-ink hover:bg-primary/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <span className="font-semibold">Bàn {c.tableName}</span>
                      {c.note && <span className="min-w-0 truncate text-slate">{c.note}</span>}
                      <span className="ml-auto inline-flex shrink-0 items-center gap-xxs text-xs font-medium text-primary">
                        <Check className="h-4 w-4" aria-hidden /> Đã xử lý
                      </span>
                    </button>
                  </li>
                ))}
              {mo === "goi" && callError && (
                <li role="alert" className="text-sm text-status-late">
                  {callError}
                </li>
              )}
            </ul>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
