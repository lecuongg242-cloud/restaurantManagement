"use client";

import { useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { BillView } from "@/lib/billing/types";
import type { SplitPick } from "@/lib/billing/split";
import { formatVnd } from "@/lib/orders/cart";
import { QtyStepper } from "@/components/customer/QtyStepper";

/**
 * SplitBillDialog (04-02) — tách 1 hóa đơn: 2 tab.
 *  - Theo món: chọn số suất mỗi món chuyển sang hóa đơn mới; xem trước tổng 2 bên.
 *  - Chia đều: chọn N (2..8); xem trước mỗi người trả total/N (dư dồn phần cuối).
 * Center modal, bám QD-006. POS nhẹ (không vaul/motion).
 */
export function SplitBillDialog({
  bill,
  busy,
  onSplitByItems,
  onSplitEvenly,
  onClose,
}: {
  bill: BillView;
  busy: boolean;
  onSplitByItems: (picks: SplitPick[]) => void;
  onSplitEvenly: (n: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"items" | "evenly">("items");
  const [picks, setPicks] = useState<Record<string, number>>({}); // billItemId → qty chuyển
  const [n, setN] = useState(2);

  const setPick = (billItemId: string, qty: number) =>
    setPicks((p) => ({ ...p, [billItemId]: qty }));

  const movedTotal = useMemo(
    () => bill.lines.reduce((s, l) => s + l.unitPrice * (picks[l.billItemId] ?? 0), 0),
    [bill.lines, picks]
  );
  const remainTotal = bill.totals.subtotal - movedTotal;
  const pickList: SplitPick[] = bill.lines
    .map((l) => ({ billItemId: l.billItemId, qty: picks[l.billItemId] ?? 0 }))
    .filter((p) => p.qty > 0);
  const canSplitItems = pickList.length > 0 && movedTotal < bill.totals.subtotal;

  const shares = useMemo(() => {
    const base = Math.floor(bill.totals.total / n);
    const arr = Array.from({ length: n }, () => base);
    arr[n - 1] += bill.totals.total - base * n;
    return arr;
  }, [bill.totals.total, n]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-md" role="dialog" aria-modal="true" aria-label="Tách hóa đơn">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
          <h3 className="font-display text-lg text-ink">Tách hóa đơn{bill.billNo != null ? ` #${bill.billNo}` : ""}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-xs px-lg pt-md">
          {(["items", "evenly"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={
                "flex-1 rounded-md px-sm py-xs text-sm font-medium " +
                (tab === k ? "bg-primary text-primary-fg" : "bg-surface text-steel hover:bg-hairline-soft")
              }
            >
              {k === "items" ? "Theo món" : "Chia đều"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          {tab === "items" ? (
            <>
              <p className="mb-sm text-xs text-steel">Chọn số suất chuyển sang hóa đơn mới:</p>
              <ul className="flex flex-col divide-y divide-hairline-soft">
                {bill.lines.map((l) => (
                  <li key={l.billItemId} className="flex items-center justify-between gap-md py-sm">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{l.name}</p>
                      <p className="text-xs text-steel tabular-nums">
                        {formatVnd(l.unitPrice)} · còn {l.qty}
                      </p>
                    </div>
                    <QtyStepper
                      value={picks[l.billItemId] ?? 0}
                      min={0}
                      max={l.qty}
                      onChange={(v) => setPick(l.billItemId, v)}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-md space-y-xs rounded-md bg-surface p-md text-sm">
                <div className="flex justify-between">
                  <span className="text-steel">Hóa đơn mới</span>
                  <span className="font-medium tabular-nums text-primary">{formatVnd(movedTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-steel">Hóa đơn còn lại</span>
                  <span className="font-medium tabular-nums text-ink">{formatVnd(remainTotal)}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mb-sm text-xs text-steel">Chia đều {formatVnd(bill.totals.total)} cho:</p>
              <div className="flex flex-wrap gap-sm">
                {[2, 3, 4, 5, 6, 7, 8].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setN(k)}
                    className={
                      "h-11 w-11 rounded-md text-sm font-semibold " +
                      (n === k ? "bg-primary text-primary-fg" : "bg-surface text-ink hover:bg-hairline-soft")
                    }
                  >
                    {k}
                  </button>
                ))}
              </div>
              <ul className="mt-md space-y-xs rounded-md bg-surface p-md text-sm">
                {shares.map((s, i) => (
                  <li key={i} className="flex justify-between">
                    <span className="text-steel">Người {i + 1}</span>
                    <span className="font-medium tabular-nums text-ink">{formatVnd(s)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="border-t border-hairline-soft px-lg py-md">
          {tab === "items" ? (
            <button
              type="button"
              disabled={!canSplitItems || busy}
              onClick={() => onSplitByItems(pickList)}
              className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tách theo món"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || bill.totals.total <= 0}
              onClick={() => onSplitEvenly(n)}
              className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Chia đều ${n} người`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
