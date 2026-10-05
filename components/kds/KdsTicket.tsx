"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Undo2 } from "lucide-react";
import type { KdsTicket as KdsTicketType } from "@/lib/orders/kds";
import { cn } from "@/lib/utils";

const LATE_SECONDS = 10 * 60; // >10 phút chưa xong → TRỄ

/**
 * kds-ticket (§4.3) — bàn (Fraunces lớn), đồng hồ đếm lên từ confirmed_at, danh sách món SL×tên + tùy chọn thụt lề + ghi chú
 * nổi bật. P27 (ORDER-04, QD-032): bếp báo xong như KiotViet "Chờ chế biến" / "Đã xong – Chờ cung ứng":
 *  - `todo`: mỗi món nút "Xong", cuối vé "Xong cả vé"; vé để lâu → viền + nhãn TRỄ. Badge delta giây (đo ORDER-04) ở góc.
 *  - `done`: món bếp đã xong chờ phục vụ mang ra — viền xanh, mỗi món nút "Trả lại" (bấm nhầm).
 */
export function KdsTicket({
  ticket,
  delta,
  mode = "todo",
  busy = false,
  onReady,
  onUndo,
}: {
  ticket: KdsTicketType;
  delta: number | undefined;
  mode?: "todo" | "done";
  busy?: boolean;
  onReady?: (itemIds: string[]) => void;
  onUndo?: (itemId: string) => void;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const confirmedMs = ticket.confirmedAt ? new Date(ticket.confirmedAt).getTime() : null;
  const elapsed = nowMs && confirmedMs ? Math.max(0, Math.floor((nowMs - confirmedMs) / 1000)) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const late = mode === "todo" && elapsed > LATE_SECONDS;
  const done = mode === "done";

  const nut =
    "inline-flex min-h-11 shrink-0 items-center gap-xxs rounded-md px-md text-sm font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-canvas p-md shadow-card",
        done ? "border-status-ready" : late ? "border-status-late" : "border-hairline"
      )}
    >
      <div className="flex items-start justify-between gap-sm">
        <div className="flex items-baseline gap-sm">
          {ticket.kitchenNo != null && (
            <span className={cn("font-semibold leading-none text-primary", done ? "text-2xl" : "text-3xl")}>
              #{ticket.kitchenNo}
            </span>
          )}
          {ticket.channel === "dine_in" || ticket.place === "Tại quán" ? (
            <span className={cn("font-semibold leading-none text-ink", done ? "text-xl" : "text-2xl")}>{ticket.place}</span>
          ) : (
            // Nhãn do server tính (place-label.ts). Đơn không bàn khách ăn tại quán (chế độ quầy, hoặc nhân viên
            // chọn "Tại quán" — P35) hiện chữ thường như đơn tại bàn; chỉ đơn mang về / giao mới tô nổi.
            <span
              className={cn(
                "rounded-md px-sm py-xxs font-semibold text-xl leading-none",
                ticket.channel === "takeaway"
                  ? "bg-cream text-primary"
                  : "bg-status-ready-bg text-status-ready"
              )}
            >
              {ticket.place}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-xxs">
          <span className="inline-flex items-center gap-xxs text-base font-semibold tabular-nums text-steel">
            <Clock className="h-4 w-4" aria-hidden />
            {mm}:{ss}
          </span>
          {!done && delta !== undefined && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                delta <= 3 ? "bg-status-ready-bg text-status-ready" : "bg-cream-soft text-status-late"
              )}
              title="Độ trễ từ lúc duyệt tới khi vé hiện (ORDER-04)"
            >
              {delta.toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {late && (
        <p className="mt-xs inline-block rounded bg-status-late px-1.5 py-0.5 text-xs font-bold text-status-late-fg">
          TRỄ
        </p>
      )}

      <ul className="mt-sm flex flex-col gap-sm">
        {ticket.items.map((it) => (
          <li
            key={it.id}
            className="flex items-start gap-sm border-t border-hairline-soft pt-sm first:border-t-0 first:pt-0"
          >
            <div className="min-w-0 flex-1">
              <p className={cn("font-semibold leading-snug text-ink", done ? "text-base" : "text-lg")}>
                {it.qty}× {it.name}
              </p>
              {it.modifiers.length > 0 && (
                <p className={cn("pl-md text-slate", done ? "text-sm" : "text-base")}>+ {it.modifiers.join(", ")}</p>
              )}
              {it.note && (
                <p className="mt-xxs rounded bg-cream px-xs py-xxs text-base font-medium text-ink">
                  ✎ {it.note}
                </p>
              )}
            </div>
            {done
              ? onUndo && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onUndo(it.id)}
                    aria-label={`Trả lại ${it.name}`}
                    className={cn(nut, "border border-hairline-strong text-steel hover:bg-surface")}
                  >
                    <Undo2 className="h-4 w-4" aria-hidden />
                    Trả lại
                  </button>
                )
              : onReady && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onReady([it.id])}
                    aria-label={`Xong ${it.name}`}
                    className={cn(nut, "border border-status-ready text-status-ready hover:bg-status-ready-bg")}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Xong
                  </button>
                )}
          </li>
        ))}
      </ul>

      {!done && onReady && ticket.items.length > 1 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onReady(ticket.items.map((i) => i.id))}
          className={cn(nut, "mt-sm w-full justify-center bg-status-ready text-canvas hover:opacity-90")}
        >
          <Check className="h-4 w-4" aria-hidden />
          Xong cả vé
        </button>
      )}
    </div>
  );
}
