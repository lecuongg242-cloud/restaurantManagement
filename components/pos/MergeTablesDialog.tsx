"use client";

import { useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { formatVnd } from "@/lib/orders/cart";

export type MergeCandidate = {
  sessionId: string;
  tableName: string;
  total: number;
  isCurrent: boolean;
};

/**
 * MergeTablesDialog (04-02) — gộp nhiều bàn thành 1 hóa đơn. Bàn hiện tại luôn được chọn; chọn
 * thêm bàn khác đang mở (có món chưa chốt). Xem trước tổng gộp. Center modal, bám QD-006.
 */
export function MergeTablesDialog({
  candidates,
  busy,
  onMerge,
  onClose,
}: {
  candidates: MergeCandidate[];
  busy: boolean;
  onMerge: (sessionIds: string[]) => void;
  onClose: () => void;
}) {
  const current = candidates.find((c) => c.isCurrent);
  const [picked, setPicked] = useState<Set<string>>(
    new Set(current ? [current.sessionId] : [])
  );

  const toggle = (id: string, isCurrent: boolean) => {
    if (isCurrent) return; // bàn hiện tại luôn chọn
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mergedTotal = useMemo(
    () => candidates.filter((c) => picked.has(c.sessionId)).reduce((s, c) => s + c.total, 0),
    [candidates, picked]
  );
  const canMerge = picked.size >= 2;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-md" role="dialog" aria-modal="true" aria-label="Gộp bàn">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
          <h3 className="font-display text-lg text-ink">Gộp bàn thành 1 hóa đơn</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          <ul className="flex flex-col gap-xs">
            {candidates.map((c) => (
              <li key={c.sessionId}>
                <label
                  className={
                    "flex cursor-pointer items-center justify-between gap-md rounded-md border px-md py-sm " +
                    (picked.has(c.sessionId) ? "border-primary bg-cream-soft" : "border-hairline")
                  }
                >
                  <span className="flex items-center gap-sm">
                    <input
                      type="checkbox"
                      checked={picked.has(c.sessionId)}
                      disabled={c.isCurrent}
                      onChange={() => toggle(c.sessionId, c.isCurrent)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm text-ink">
                      Bàn {c.tableName}
                      {c.isCurrent && <span className="ml-xs text-xs text-steel">(đang xem)</span>}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-steel">{formatVnd(c.total)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-hairline-soft px-lg py-md">
          <div className="mb-sm flex items-center justify-between text-sm">
            <span className="text-steel">Tổng gộp ({picked.size} bàn)</span>
            <span className="font-semibold tabular-nums text-primary">{formatVnd(mergedTotal)}</span>
          </div>
          <button
            type="button"
            disabled={!canMerge || busy}
            onClick={() => onMerge([...picked])}
            className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gộp bàn"}
          </button>
        </div>
      </div>
    </div>
  );
}
