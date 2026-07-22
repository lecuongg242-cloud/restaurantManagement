"use client";

import { useState } from "react";
import { X, Loader2, Printer, Banknote, Landmark, Check } from "lucide-react";
import type { BillView, PaymentMethod } from "@/lib/billing/types";
import { formatVnd } from "@/lib/orders/cart";

/**
 * PaymentDialog (04-04, BILL-04) — thu tiền + đóng bill. Tiền mặt: nhập khách đưa + nút mệnh giá
 * nhanh → tiền thối. Chuyển khoản: xác nhận đã nhận đủ (QD D-P4-1, không QR). Sau đóng → in hóa
 * đơn + Xong. Center modal, bám QD-006.
 */
export function PaymentDialog({
  bill,
  busy,
  onPay,
  onPrint,
  onClose,
}: {
  bill: BillView;
  busy: boolean;
  onPay: (method: PaymentMethod, amountReceived: number) => Promise<{ ok: boolean; change?: number; error?: string }>;
  onPrint: () => void;
  onClose: () => void;
}) {
  const total = bill.totals.total;
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [received, setReceived] = useState<number>(total);
  const [done, setDone] = useState<{ change: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = Math.max(0, received - total);
  const quicks = Array.from(new Set([total, Math.ceil(total / 50000) * 50000, 100000, 200000, 500000])).sort((a, b) => a - b);

  const confirm = async () => {
    setError(null);
    const res = await onPay(method, method === "cash" ? received : total);
    if (!res.ok) {
      setError(res.error ?? "Thu tiền thất bại.");
      return;
    }
    setDone({ change: res.change ?? 0 });
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-md" role="dialog" aria-modal="true" aria-label="Thu tiền">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
          <h3 className="font-display text-lg text-ink">
            {done ? "Đã thanh toán" : "Thu tiền"}
            {bill.billNo != null ? ` · #${bill.billNo}` : ""}
          </h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          <div className="mb-md flex items-center justify-between">
            <span className="text-sm text-steel">Tổng phải thu</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-primary">{formatVnd(total)}</span>
          </div>

          {done ? (
            <div className="rounded-md bg-surface p-lg text-center">
              <Check className="mx-auto h-8 w-8 text-status-ready" />
              <p className="mt-sm text-sm text-ink">Đã ghi nhận thanh toán.</p>
              {done.change > 0 && (
                <p className="mt-xs text-lg font-semibold tabular-nums text-ink">
                  Tiền trả lại: {formatVnd(done.change)}
                </p>
              )}
            </div>
          ) : (
            <>
              {error && (
                <p role="alert" className="mb-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
                  {error}
                </p>
              )}
              <div className="flex gap-sm">
                <MethodBtn active={method === "cash"} onClick={() => setMethod("cash")} icon={<Banknote className="h-4 w-4" />} label="Tiền mặt" />
                <MethodBtn active={method === "transfer"} onClick={() => setMethod("transfer")} icon={<Landmark className="h-4 w-4" />} label="Chuyển khoản" />
              </div>

              {method === "cash" ? (
                <div className="mt-md">
                  <label className="text-sm font-medium text-ink">Khách đưa</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={received || ""}
                    onChange={(e) => setReceived(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-xs h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="mt-sm flex flex-wrap gap-xs">
                    {quicks.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setReceived(q)}
                        className="rounded-md border border-hairline px-sm py-xs text-xs tabular-nums text-ink hover:bg-surface"
                      >
                        {formatVnd(q)}
                      </button>
                    ))}
                  </div>
                  <div className="mt-md flex items-center justify-between rounded-md bg-surface px-md py-sm">
                    <span className="text-sm text-steel">Tiền trả lại</span>
                    <span className="text-lg font-semibold tabular-nums text-ink">{formatVnd(change)}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-md rounded-md bg-surface px-md py-md text-sm text-steel">
                  Xác nhận đã nhận đủ {formatVnd(total)} qua chuyển khoản.
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-hairline-soft px-lg py-md">
          {done ? (
            <div className="flex gap-sm">
              <button
                type="button"
                onClick={onPrint}
                className="inline-flex h-12 flex-1 items-center justify-center gap-sm rounded-md border border-hairline-strong text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Printer className="h-4 w-4" /> In hóa đơn
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Xong
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || (method === "cash" && received < total)}
              onClick={confirm}
              className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Xác nhận thu · đóng bill"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MethodBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-12 flex-1 items-center justify-center gap-sm rounded-md border text-sm font-medium " +
        (active ? "border-primary bg-cream text-ink" : "border-hairline text-steel hover:bg-surface")
      }
    >
      {icon} {label}
    </button>
  );
}
