"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { BillView, DiscountType } from "@/lib/billing/types";
import { computeBillTotals } from "@/lib/billing/compute";
import { formatVnd } from "@/lib/orders/cart";
import { PinPrompt } from "./PinPrompt";
import type { CancelStaff } from "./CancelItemDialog";

export type AdjustPayload = {
  discountType: DiscountType;
  discountValue: number;
  serviceChargePct: number;
  vatPct: number;
};

/**
 * AdjustBillDialog (04-03, BILL-03) — giảm giá (số tiền/%) + %phí + %VAT với xem trước tổng.
 * Giảm giá cần PIN manager/cashier (PinPrompt); chỉ đổi %phí/%VAT thì lưu thẳng. Ẩn giảm giá khi
 * allow_discount=false. Center modal, bám QD-006.
 */
export function AdjustBillDialog({
  bill,
  allowDiscount,
  staff,
  canSkipPin,
  busy,
  error,
  onApplyDiscount,
  onSetCharges,
  onClose,
}: {
  bill: BillView;
  allowDiscount: boolean;
  staff: CancelStaff[];
  canSkipPin: boolean;
  busy: boolean;
  error: string | null;
  onApplyDiscount: (payload: AdjustPayload, creds: { membershipId?: string; pin?: string }) => void;
  onSetCharges: (payload: { serviceChargePct: number; vatPct: number }) => void;
  onClose: () => void;
}) {
  const [discountType, setDiscountType] = useState<DiscountType>(bill.discountType);
  const [discountValue, setDiscountValue] = useState<number>(bill.discountValue);
  const [servicePct, setServicePct] = useState<number>(bill.serviceChargePct);
  const [vatPct, setVatPct] = useState<number>(bill.vatPct);
  const [pinOpen, setPinOpen] = useState(false);

  const preview = useMemo(
    () =>
      computeBillTotals({
        lines: bill.lines.map((l) => ({ amount: l.amount })),
        discountType,
        discountValue,
        serviceChargePct: servicePct,
        vatPct,
      }),
    [bill.lines, discountType, discountValue, servicePct, vatPct]
  );

  const discountChanged = discountType !== bill.discountType || discountValue !== bill.discountValue;
  const payload: AdjustPayload = { discountType, discountValue, serviceChargePct: servicePct, vatPct };

  const save = () => {
    // Áp giảm giá (mới) cần PIN; chỉ đổi phí/VAT thì lưu thẳng.
    if (discountChanged && discountType !== "none") {
      if (canSkipPin) onApplyDiscount(payload, {});
      else setPinOpen(true);
      return;
    }
    if (discountChanged) onApplyDiscount(payload, {}); // gỡ giảm giá (về none) — không cần PIN
    else onSetCharges({ serviceChargePct: servicePct, vatPct });
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-md" role="dialog" aria-modal="true" aria-label="Điều chỉnh hóa đơn">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
          <h3 className="font-display text-lg text-ink">Điều chỉnh hóa đơn{bill.billNo != null ? ` #${bill.billNo}` : ""}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          {error && (
            <p role="alert" className="mb-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
              {error}
            </p>
          )}

          {allowDiscount && (
            <fieldset>
              <legend className="text-sm font-medium text-ink">Giảm giá</legend>
              <div className="mt-sm flex gap-xs">
                {(["none", "amount", "percent"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDiscountType(k)}
                    className={
                      "flex-1 rounded-md px-sm py-xs text-sm font-medium " +
                      (discountType === k ? "bg-primary text-primary-fg" : "bg-surface text-steel hover:bg-hairline-soft")
                    }
                  >
                    {k === "none" ? "Không" : k === "amount" ? "Số tiền" : "%"}
                  </button>
                ))}
              </div>
              {discountType !== "none" && (
                <div className="mt-sm">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={discountType === "percent" ? 100 : undefined}
                    value={discountValue || ""}
                    onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value) || 0))}
                    placeholder={discountType === "percent" ? "VD: 10 (%)" : "VD: 50000 (đ)"}
                    className="h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </fieldset>
          )}

          <fieldset className="mt-lg">
            <legend className="text-sm font-medium text-ink">Phí & thuế</legend>
            <div className="mt-sm grid grid-cols-2 gap-md">
              <label className="text-xs text-steel">
                Phí phục vụ %
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={servicePct || ""}
                  onChange={(e) => setServicePct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="mt-xs h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="text-xs text-steel">
                VAT %
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={vatPct || ""}
                  onChange={(e) => setVatPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="mt-xs h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
          </fieldset>

          <div className="mt-lg space-y-xs rounded-md bg-surface p-md text-sm">
            <div className="flex justify-between"><span className="text-steel">Tạm tính</span><span className="tabular-nums text-ink">{formatVnd(preview.subtotal)}</span></div>
            {preview.discountAmount > 0 && (
              <div className="flex justify-between"><span className="text-steel">Giảm giá</span><span className="tabular-nums text-status-late">− {formatVnd(preview.discountAmount)}</span></div>
            )}
            {servicePct > 0 && (
              <div className="flex justify-between"><span className="text-steel">Phí phục vụ {servicePct}%</span><span className="tabular-nums text-ink">{formatVnd(preview.serviceChargeAmount)}</span></div>
            )}
            {vatPct > 0 && (
              <div className="flex justify-between"><span className="text-steel">VAT {vatPct}%</span><span className="tabular-nums text-ink">{formatVnd(preview.vatAmount)}</span></div>
            )}
            <div className="flex justify-between border-t border-hairline pt-xs font-semibold">
              <span className="text-ink">TỔNG</span><span className="tabular-nums text-primary">{formatVnd(preview.total)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-hairline-soft px-lg py-md">
          <button
            type="button"
            disabled={busy || (discountType !== "none" && discountValue <= 0)}
            onClick={save}
            className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
          >
            {discountChanged && discountType !== "none" && !canSkipPin ? "Lưu (cần PIN)" : "Lưu"}
          </button>
        </div>
      </div>

      {pinOpen && (
        <PinPrompt
          title="Xác nhận giảm giá"
          staff={staff}
          canSkip={canSkipPin}
          busy={busy}
          error={null}
          onSubmit={(creds) => {
            setPinOpen(false);
            onApplyDiscount(payload, creds);
          }}
          onCancel={() => setPinOpen(false)}
        />
      )}
    </div>
  );
}
