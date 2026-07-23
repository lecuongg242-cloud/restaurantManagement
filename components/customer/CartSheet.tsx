"use client";

import { Drawer } from "vaul";
import { Trash2, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { CustomerMenuItem } from "@/lib/orders/customer-menu";
import type { CartLine } from "@/lib/orders/types";
import type { OnlineChannel } from "@/lib/orders/online";
import { formatVnd, unitPrice } from "@/lib/orders/cart";
import { cn } from "@/lib/utils";
import { QtyStepper } from "./QtyStepper";

/**
 * cart-sheet (§5.2) — soát lại giỏ + ghi chú chung + "Gửi order". Vaul bottom sheet.
 * Tên/giá/tùy chọn resolve từ menu (itemMap) — giỏ chỉ lưu id (state client).
 */
export function CartSheet({
  open,
  onOpenChange,
  lines,
  itemMap,
  orderNote,
  onOrderNoteChange,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  onChangeQty,
  onChangeNote,
  onRemove,
  onSubmit,
  submitting,
  errorMsg,
  online = false,
  channel = "takeaway",
  onChannelChange,
  address = "",
  onAddressChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lines: CartLine[];
  itemMap: Map<string, CustomerMenuItem>;
  orderNote: string;
  onOrderNoteChange: (v: string) => void;
  customerName: string;
  onCustomerNameChange: (v: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (v: string) => void;
  onChangeQty: (lineId: string, qty: number) => void;
  onChangeNote: (lineId: string, note: string) => void;
  onRemove: (lineId: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  errorMsg: string | null;
  /** Chế độ đặt online: hiện toggle kênh + địa chỉ (khi giao), SĐT bắt buộc. */
  online?: boolean;
  channel?: OnlineChannel;
  onChannelChange?: (c: OnlineChannel) => void;
  address?: string;
  onAddressChange?: (v: string) => void;
}) {
  // Điều kiện gửi: luôn cần tên; online cần SĐT; giao cần địa chỉ.
  const contactReady =
    !!customerName.trim() &&
    (!online || !!customerPhone.trim()) &&
    (!online || channel !== "delivery" || !!address.trim());
  const total = lines.reduce((sum, l) => {
    const item = itemMap.get(l.itemId);
    if (!item) return sum;
    return sum + unitPrice(item, l.optionIds) * l.qty;
  }, 0);

  const optionNames = (item: CustomerMenuItem, optionIds: string[]) => {
    const set = new Set(optionIds);
    const names: string[] = [];
    for (const g of item.groups) for (const o of g.options) if (set.has(o.id)) names.push(o.name);
    return names;
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] max-w-md flex-col rounded-t-xl bg-canvas shadow-modal outline-none">
          <div className="mx-auto mt-sm h-1.5 w-10 shrink-0 rounded-full bg-hairline-strong" />
          <Drawer.Title className="shrink-0 px-lg pt-sm font-display text-xl text-ink">
            Giỏ của bạn
          </Drawer.Title>

          <div className="min-h-0 flex-1 overflow-y-auto px-lg py-sm">
            {lines.length === 0 ? (
              <p className="py-xl text-center text-sm text-steel">Giỏ đang trống.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline-soft">
                <AnimatePresence initial={false}>
                  {lines.map((l) => {
                    const item = itemMap.get(l.itemId);
                    if (!item) return null;
                    const names = optionNames(item, l.optionIds);
                    const lineTotal = unitPrice(item, l.optionIds) * l.qty;
                    return (
                      <motion.li
                        key={l.lineId}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex gap-md py-md"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug text-ink">{item.name}</p>
                          {names.length > 0 && (
                            <p className="mt-xxs text-xs text-steel">{names.join(" · ")}</p>
                          )}
                          <div className="mt-sm flex items-center gap-md">
                            <QtyStepper
                              value={l.qty}
                              onChange={(v) => onChangeQty(l.lineId, v)}
                            />
                            <button
                              type="button"
                              onClick={() => onRemove(l.lineId)}
                              aria-label="Xóa món khỏi giỏ"
                              className="grid h-9 w-9 place-items-center rounded-md text-status-late hover:bg-surface"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <input
                            value={l.note}
                            onChange={(e) => onChangeNote(l.lineId, e.target.value)}
                            maxLength={200}
                            placeholder="Ghi chú món này (VD: ít cay, không hành…)"
                            aria-label={`Ghi chú cho ${item.name}`}
                            className="mt-sm h-9 w-full rounded-md border border-hairline px-sm text-xs text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                          {formatVnd(lineTotal)}
                        </span>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}

            {lines.length > 0 && online && (
              <div className="mt-md">
                <span className="text-sm font-medium text-ink">Hình thức</span>
                <div className="mt-xs grid grid-cols-2 gap-sm">
                  {(["takeaway", "delivery"] as OnlineChannel[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChannelChange?.(c)}
                      aria-pressed={channel === c}
                      className={cn(
                        "h-11 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        channel === c
                          ? "border-primary bg-primary text-primary-fg"
                          : "border-hairline-strong bg-canvas text-ink hover:bg-surface"
                      )}
                    >
                      {c === "takeaway" ? "Mang về" : "Giao tận nơi"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lines.length > 0 && (
              <div className="mt-md">
                <label htmlFor="cust-name" className="text-sm font-medium text-ink">
                  Tên của bạn <span className="text-status-late">*</span>
                </label>
                <input
                  id="cust-name"
                  value={customerName}
                  onChange={(e) => onCustomerNameChange(e.target.value)}
                  maxLength={50}
                  placeholder="VD: Anh Nam"
                  className="mt-xs h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <label htmlFor="cust-phone" className="mt-md block text-sm font-medium text-ink">
                  Số điện thoại {online && <span className="text-status-late">*</span>}
                </label>
                <input
                  id="cust-phone"
                  type="tel"
                  inputMode="tel"
                  value={customerPhone}
                  onChange={(e) => onCustomerPhoneChange(e.target.value)}
                  maxLength={20}
                  placeholder="VD: 0901 234 567"
                  className="mt-xs h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />

                {online && channel === "delivery" && (
                  <>
                    <label htmlFor="cust-address" className="mt-md block text-sm font-medium text-ink">
                      Địa chỉ giao <span className="text-status-late">*</span>
                    </label>
                    <textarea
                      id="cust-address"
                      value={address}
                      onChange={(e) => onAddressChange?.(e.target.value)}
                      maxLength={200}
                      rows={2}
                      placeholder="Số nhà, đường, phường/xã…"
                      className="mt-xs w-full resize-none rounded-md border border-hairline px-md py-sm text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </>
                )}
              </div>
            )}

            {lines.length > 0 && (
              <div className="mt-md">
                <label htmlFor="order-note" className="text-sm font-medium text-ink">
                  Ghi chú cho cả đơn
                </label>
                <textarea
                  id="order-note"
                  value={orderNote}
                  onChange={(e) => onOrderNoteChange(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="VD: mang ra cùng lúc, thêm chén…"
                  className="mt-xs w-full resize-none rounded-md border border-hairline px-md py-sm text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
          </div>

          {/* Đáy: tổng + gửi */}
          <div className="shrink-0 border-t border-hairline-soft bg-canvas px-lg py-sm pb-[max(12px,env(safe-area-inset-bottom))]">
            {errorMsg && (
              <p role="alert" className="mb-sm rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
                {errorMsg}
              </p>
            )}
            <div className="mb-sm flex items-center justify-between">
              <span className="text-sm text-steel">Tạm tính</span>
              <span className="text-lg font-semibold tabular-nums text-ink">{formatVnd(total)}</span>
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={lines.length === 0 || submitting || !contactReady}
              className="flex h-12 w-full items-center justify-center gap-sm rounded-md bg-primary text-base font-medium text-primary-fg transition-colors hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang gửi…</span>
                </>
              ) : (
                <span>{online ? "Đặt đơn" : "Gửi order"}</span>
              )}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
