"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { KdsTicket as KdsTicketType } from "@/lib/orders/kds";
import { cn } from "@/lib/utils";

const LATE_SECONDS = 10 * 60; // >10 phút chưa phục vụ → TRỄ

/**
 * kds-ticket (§4.3) — VÉ BẾP CHỈ ĐỂ XEM: bàn (Fraunces lớn), đồng hồ đếm lên từ confirmed_at,
 * danh sách món SL×tên + tùy chọn thụt lề + ghi chú nổi bật. KHÔNG nút thao tác (bếp không chạm —
 * QĐ 22/07). Badge delta giây (đo ORDER-04) ở góc: xanh nếu ≤3s. Vé để lâu → viền + nhãn TRỄ.
 */
export function KdsTicket({
  ticket,
  delta,
}: {
  ticket: KdsTicketType;
  delta: number | undefined;
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
  const late = elapsed > LATE_SECONDS;

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-canvas p-md shadow-card",
        late ? "border-status-late" : "border-hairline"
      )}
    >
      <div className="flex items-start justify-between gap-sm">
        <div className="flex items-baseline gap-sm">
          {ticket.kitchenNo != null && (
            <span className="font-display text-3xl font-semibold leading-none text-primary">
              #{ticket.kitchenNo}
            </span>
          )}
          <span className="font-display text-2xl leading-none text-ink">Bàn {ticket.tableName}</span>
        </div>
        <div className="flex flex-col items-end gap-xxs">
          <span className="inline-flex items-center gap-xxs text-base font-semibold tabular-nums text-steel">
            <Clock className="h-4 w-4" aria-hidden />
            {mm}:{ss}
          </span>
          {delta !== undefined && (
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
          <li key={it.id} className="border-t border-hairline-soft pt-sm first:border-t-0 first:pt-0">
            <p className="text-lg font-semibold leading-snug text-ink">
              {it.qty}× {it.name}
            </p>
            {it.modifiers.length > 0 && (
              <p className="pl-md text-base text-slate">+ {it.modifiers.join(", ")}</p>
            )}
            {it.note && (
              <p className="mt-xxs rounded bg-cream px-xs py-xxs text-base font-medium text-ink">
                ✎ {it.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
