"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Scissors, Merge, Percent, Wallet, Printer } from "lucide-react";
import type { BillView, PaymentMethod } from "@/lib/billing/types";
import type { SplitPick } from "@/lib/billing/split";
import { formatVnd } from "@/lib/orders/cart";
import { SplitBillDialog } from "./SplitBillDialog";
import { MergeTablesDialog, type MergeCandidate } from "./MergeTablesDialog";
import { AdjustBillDialog, type AdjustPayload } from "./AdjustBillDialog";
import { PaymentDialog } from "./PaymentDialog";
import type { CancelStaff } from "./CancelItemDialog";

/**
 * BillPanel (04-01/04-02) — hóa đơn của 1 bàn. Sau tách/chia đều, 1 bàn có nhiều hóa đơn:
 * thanh chọn ở trên, chi tiết bên dưới. Tách theo món / chia đều N (dialog) + gộp bàn.
 * Điều chỉnh (04-03) + Thu tiền (04-04) chừa chỗ.
 */
export function BillPanel({
  bills,
  loading,
  busy,
  error,
  mergeCandidates,
  allowDiscount,
  adjustStaff,
  canSkipPin,
  onSplitByItems,
  onSplitByOrders,
  onSplitEvenly,
  onMerge,
  onApplyDiscount,
  onSetCharges,
  onPay,
  onPrintReceipt,
  onClose,
}: {
  bills: BillView[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  mergeCandidates: MergeCandidate[];
  allowDiscount: boolean;
  adjustStaff: CancelStaff[];
  canSkipPin: boolean;
  onSplitByItems: (billId: string, picks: SplitPick[]) => void;
  onSplitByOrders: (billId: string, orderIds: string[]) => void;
  onSplitEvenly: (billId: string, n: number) => void;
  onMerge: (sessionIds: string[]) => void;
  onApplyDiscount: (billId: string, payload: AdjustPayload, creds: { membershipId?: string; pin?: string }) => void;
  onSetCharges: (billId: string, payload: { serviceChargePct: number; vatPct: number }) => void;
  onPay: (billId: string, method: PaymentMethod, amountReceived: number) => Promise<{ ok: boolean; change?: number; error?: string }>;
  onPrintReceipt: (billId: string) => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [splitFor, setSplitFor] = useState<BillView | null>(null);
  const [adjustFor, setAdjustFor] = useState<BillView | null>(null);
  const [payFor, setPayFor] = useState<BillView | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  // Giữ lựa chọn hợp lệ khi danh sách đổi (sau tách/gộp).
  useEffect(() => {
    if (bills.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !bills.some((b) => b.id === selectedId)) setSelectedId(bills[0].id);
  }, [bills, selectedId]);

  const selected = bills.find((b) => b.id === selectedId) ?? null;
  const isParent = selected != null && selected.splitCount != null;
  const isChild = selected != null && selected.splitParentId != null;
  const canSplit = selected != null && selected.status === "open" && !isParent && !isChild;
  const isPaid = selected != null && selected.status === "paid";
  const payable = selected != null && selected.status === "open" && !isParent; // thường/gộp/con

  const billLabel = (b: BillView) => {
    if (b.splitParentId != null) return b.note?.startsWith("Chia đều") ? b.note.split(" · ")[0] : `Phần chia`;
    if (b.splitCount != null) return `#${b.billNo ?? "?"} · đã chia ${b.splitCount}`;
    if (b.tableSessionId == null) return `#${b.billNo ?? "?"} · gộp`;
    return `#${b.billNo ?? "?"}`;
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-md" role="dialog" aria-modal="true" aria-label="Hóa đơn">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
          <h2 className="font-display text-xl text-ink">Hóa đơn</h2>
          <div className="flex items-center gap-xs">
            {mergeCandidates.some((c) => !c.isCurrent) && (
              <button
                type="button"
                onClick={() => setMergeOpen(true)}
                className="inline-flex h-9 items-center gap-xxs rounded-md border border-hairline-strong px-sm text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Merge className="h-3.5 w-3.5" /> Gộp bàn
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng hóa đơn"
              className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="mx-lg mt-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
            {error}
          </p>
        )}

        {/* Thanh chọn hóa đơn (khi >1) */}
        {bills.length > 1 && (
          <div className="flex gap-xs overflow-x-auto border-b border-hairline-soft px-lg py-sm">
            {bills.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedId(b.id)}
                className={
                  "shrink-0 rounded-md px-sm py-xs text-xs font-medium " +
                  (b.id === selectedId ? "bg-primary text-primary-fg" : "bg-surface text-steel hover:bg-hairline-soft")
                }
              >
                {billLabel(b)} · {formatVnd(b.totals.total)}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          {loading || !selected ? (
            <div className="grid place-items-center py-xl">
              <Loader2 className="h-6 w-6 animate-spin text-steel" />
            </div>
          ) : isChild ? (
            <div className="py-lg text-center">
              <p className="text-sm text-steel">{selected.note}</p>
              <p className="mt-sm font-display text-3xl font-semibold tabular-nums text-primary">
                {formatVnd(selected.totals.total)}
              </p>
              <p className="mt-xs text-xs text-steel">Phần chia đều — thu ở bước thanh toán (04-04).</p>
            </div>
          ) : (
            <>
              {isParent && (
                <p className="mb-sm rounded-md bg-surface px-md py-sm text-xs text-steel">
                  Hóa đơn này đã chia đều {selected.splitCount} phần — chọn các phần con ở thanh trên để thu.
                </p>
              )}
              <ul className="flex flex-col divide-y divide-hairline-soft">
                {selected.lines.map((l) => (
                  <li key={l.billItemId} className="flex items-start justify-between gap-md py-sm">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {l.qty}× {l.name}
                      </p>
                      {l.modifiers.length > 0 && <p className="text-xs text-steel">{l.modifiers.join(" · ")}</p>}
                      <p className="text-xs text-steel tabular-nums">{formatVnd(l.unitPrice)}/phần</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-ink">{formatVnd(l.amount)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-md space-y-xs border-t border-hairline pt-md text-sm">
                <Row label="Tạm tính" value={formatVnd(selected.totals.subtotal)} />
                {selected.totals.discountAmount > 0 && (
                  <Row label="Giảm giá" value={`− ${formatVnd(selected.totals.discountAmount)}`} accent />
                )}
                {selected.serviceChargePct > 0 && (
                  <Row label={`Phí phục vụ ${selected.serviceChargePct}%`} value={formatVnd(selected.totals.serviceChargeAmount)} />
                )}
                {selected.vatPct > 0 && (
                  <Row label={`VAT ${selected.vatPct}%`} value={formatVnd(selected.totals.vatAmount)} />
                )}
              </div>
            </>
          )}
        </div>

        {selected && (isPaid || payable) && (
          <div className="border-t border-hairline-soft px-lg py-md">
            {!isChild && (
              <div className="mb-md flex items-center justify-between">
                <span className="font-display text-lg text-ink">TỔNG</span>
                <span className="font-display text-2xl font-semibold tabular-nums text-primary">
                  {formatVnd(selected.totals.total)}
                </span>
              </div>
            )}
            {canSplit && (
              <div className="mb-sm flex gap-sm">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAdjustFor(selected)}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-xxs rounded-md border border-hairline-strong px-md text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <Percent className="h-4 w-4" /> Điều chỉnh
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSplitFor(selected)}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-xxs rounded-md border border-hairline-strong px-md text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <Scissors className="h-4 w-4" /> Tách bill
                </button>
              </div>
            )}
            {payable && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPayFor(selected)}
                  className="inline-flex h-12 w-full items-center justify-center gap-sm rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  <Wallet className="h-4 w-4" /> Thu tiền
                </button>
                <button
                  type="button"
                  onClick={() => onPrintReceipt(selected.id)}
                  className="mt-sm inline-flex h-11 w-full items-center justify-center gap-sm rounded-md border border-hairline-strong text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <Printer className="h-4 w-4" /> In tạm tính
                </button>
              </>
            )}
            {isPaid && (
              <button
                type="button"
                onClick={() => onPrintReceipt(selected.id)}
                className="inline-flex h-12 w-full items-center justify-center gap-sm rounded-md border border-hairline-strong text-base font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Printer className="h-4 w-4" /> In lại hóa đơn
              </button>
            )}
          </div>
        )}
      </div>

      {splitFor && (
        <SplitBillDialog
          bill={splitFor}
          busy={busy}
          onSplitByItems={(picks) => {
            onSplitByItems(splitFor.id, picks);
            setSplitFor(null);
          }}
          onSplitByOrders={(orderIds) => {
            onSplitByOrders(splitFor.id, orderIds);
            setSplitFor(null);
          }}
          onSplitEvenly={(n) => {
            onSplitEvenly(splitFor.id, n);
            setSplitFor(null);
          }}
          onClose={() => setSplitFor(null)}
        />
      )}

      {adjustFor && (
        <AdjustBillDialog
          bill={adjustFor}
          allowDiscount={allowDiscount}
          staff={adjustStaff}
          canSkipPin={canSkipPin}
          busy={busy}
          error={null}
          onApplyDiscount={(payload, creds) => {
            onApplyDiscount(adjustFor.id, payload, creds);
            setAdjustFor(null);
          }}
          onSetCharges={(payload) => {
            onSetCharges(adjustFor.id, payload);
            setAdjustFor(null);
          }}
          onClose={() => setAdjustFor(null)}
        />
      )}

      {payFor && (
        <PaymentDialog
          bill={payFor}
          busy={busy}
          onPay={(method, amountReceived) => onPay(payFor.id, method, amountReceived)}
          onPrint={() => onPrintReceipt(payFor.id)}
          onClose={() => setPayFor(null)}
        />
      )}

      {mergeOpen && (
        <MergeTablesDialog
          candidates={mergeCandidates}
          busy={busy}
          onMerge={(ids) => {
            onMerge(ids);
            setMergeOpen(false);
          }}
          onClose={() => setMergeOpen(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-steel">{label}</span>
      <span className={"tabular-nums " + (accent ? "text-status-late" : "text-ink")}>{value}</span>
    </div>
  );
}
