"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Loader2 } from "lucide-react";
import type { KdsTicket as KdsTicketType } from "@/lib/orders/kds";
import { startItem, readyItem } from "@/app/r/[slug]/kds/actions";
import { cn } from "@/lib/utils";

const LATE_SECONDS = 10 * 60; // >10 phút chưa xong → TRỄ

/**
 * kds-ticket (§4.3) — vé bếp: bàn (Fraunces lớn), đồng hồ đếm lên từ confirmed_at, món SL×tên +
 * tùy chọn thụt lề + ghi chú nổi bật, nút LỚN Bắt đầu/Xong mức món. Chữ đọc xa, màu + NHÃN chữ.
 * Badge delta giây (đo ORDER-04) ở góc: xanh nếu ≤3s.
 */
export function KdsTicket({
  slug,
  ticket,
  delta,
}: {
  slug: string;
  ticket: KdsTicketType;
  delta: number | undefined;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
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
  const late = elapsed > LATE_SECONDS && ticket.status !== "ready";

  const act = async (fn: typeof startItem, itemId: string) => {
    setBusy(itemId);
    const res = await fn(slug, itemId);
    setBusy(null);
    if (res.ok) router.refresh();
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-canvas p-md shadow-card",
        late ? "border-status-late" : "border-hairline"
      )}
    >
      <div className="flex items-start justify-between gap-sm">
        <span className="font-display text-2xl leading-none text-ink">Bàn {ticket.tableName}</span>
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
            <div className="flex items-start justify-between gap-sm">
              <div className="min-w-0">
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
              </div>

              {it.status === "queued" && (
                <button
                  type="button"
                  disabled={busy === it.id}
                  onClick={() => act(startItem, it.id)}
                  className="inline-flex h-11 shrink-0 items-center rounded-md bg-primary px-md text-base font-semibold text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {busy === it.id ? <Loader2 className="h-5 w-5 animate-spin" /> : "Bắt đầu"}
                </button>
              )}
              {it.status === "preparing" && (
                <button
                  type="button"
                  disabled={busy === it.id}
                  onClick={() => act(readyItem, it.id)}
                  className="inline-flex h-11 shrink-0 items-center rounded-md bg-status-ready px-md text-base font-semibold text-status-ready-bg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-ready focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {busy === it.id ? <Loader2 className="h-5 w-5 animate-spin" /> : "Xong"}
                </button>
              )}
              {it.status === "ready" && (
                <span className="inline-flex h-11 shrink-0 items-center gap-xxs rounded-md px-md text-base font-semibold text-status-ready">
                  <Check className="h-5 w-5" strokeWidth={3} /> Xong
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
