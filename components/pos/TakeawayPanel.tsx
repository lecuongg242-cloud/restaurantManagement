"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, ShoppingBag, Printer } from "lucide-react";
import type { CustomerMenuItem } from "@/lib/orders/customer-menu";
import type { CartLine } from "@/lib/orders/types";
import type { BillView, PaymentMethod } from "@/lib/billing/types";
import type { OnlineOrderView } from "@/lib/orders/online";
import { formatVnd, unitPrice } from "@/lib/orders/cart";
import { getPrintAdapter } from "@/lib/print/adapter";
import { QtyStepper } from "@/components/customer/QtyStepper";
import { ModifierSheet, type PendingLine } from "@/components/customer/ModifierSheet";
import { Input } from "@/components/ui/input";
import { PaymentDialog } from "./PaymentDialog";
import {
  createTakeawayOrderAction,
  openOnlineBillAction,
  payOnlineBillAction,
} from "@/app/r/[slug]/pos/actions";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * TakeawayPanel (POS — bán mang về tại quầy). Xử lý TRỌN trên /pos, chịu nhiều khách liên tục:
 *  - Trên cùng: gõ đơn mới (giỏ + tên/SĐT) → "Tạo đơn mang về" (source=staff, confirmed → xuống bếp).
 *  - Dưới: danh sách đơn mang về ĐANG CHỜ — mỗi đơn hiện món + tổng (như panel bàn), có "In phiếu
 *    bếp" + "Thu tiền & hoàn tất". Tạo xong đơn tự vào danh sách, builder sạch cho khách kế.
 */
export function TakeawayPanel({
  slug,
  cart,
  itemMap,
  orders,
  onCartQty,
  onCartRemove,
  onCartEdit,
  onClearCart,
  onClose,
}: {
  slug: string;
  cart: CartLine[];
  itemMap: Map<string, CustomerMenuItem>;
  orders: OnlineOrderView[];
  onCartQty: (lineId: string, qty: number) => void;
  onCartRemove: (lineId: string) => void;
  onCartEdit: (lineId: string, line: PendingLine) => void;
  onClearCart: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payBill, setPayBill] = useState<BillView | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState<{
    lineId: string;
    item: CustomerMenuItem;
    initial: { qty: number; note: string; optionIds: string[] };
  } | null>(null);

  const cartTotal = cart.reduce((s, l) => {
    const it = itemMap.get(l.itemId);
    return it ? s + unitPrice(it, l.optionIds) * l.qty : s;
  }, 0);

  const optionNames = (item: CustomerMenuItem, optionIds: string[]) => {
    const set = new Set(optionIds);
    const names: string[] = [];
    for (const g of item.groups) for (const o of g.options) if (set.has(o.id)) names.push(o.name);
    return names;
  };

  const create = async () => {
    if (cart.length === 0) return;
    setCreating(true);
    setError(null);
    const res = await createTakeawayOrderAction(
      slug,
      cart.map((l) => ({ itemId: l.itemId, qty: l.qty, note: l.note, optionIds: l.optionIds })),
      { name: name.trim() || undefined, phone: phone.trim() || undefined }
    );
    setCreating(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Đơn vào danh sách chờ; dọn builder cho khách kế.
    onClearCart();
    setName("");
    setPhone("");
    router.refresh();
  };

  const openPayment = async (orderId: string) => {
    setOpeningId(orderId);
    setError(null);
    const res = await openOnlineBillAction(slug, orderId);
    setOpeningId(null);
    if (!res.ok) setError(res.error);
    else setPayBill(res.bill);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
        <h2 className="inline-flex items-center gap-sm font-display text-xl text-ink">
          <ShoppingBag className="h-5 w-5 text-primary" /> Bán mang về
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bán mang về"
          className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <p role="alert" className="mx-lg mt-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
        {/* ---- Đơn mới (builder) ---- */}
        <div className="rounded-lg border border-hairline-soft p-md">
          <p className="text-sm font-medium text-ink">Đơn mới</p>
          {cart.length === 0 ? (
            <p className="py-md text-center text-sm text-steel">Chạm món ở thực đơn để thêm.</p>
          ) : (
            <ul className="mt-sm flex flex-col gap-sm">
              {cart.map((l) => {
                const it = itemMap.get(l.itemId);
                if (!it) return null;
                const names = optionNames(it, l.optionIds);
                return (
                  <li key={l.lineId} className="flex items-start justify-between gap-sm border-b border-hairline-soft pb-sm last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{it.name}</p>
                      {names.length > 0 && <p className="text-xs text-steel">{names.join(" · ")}</p>}
                      {l.note && <p className="text-xs italic text-stone">“{l.note}”</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-sm">
                      <QtyStepper value={l.qty} onChange={(v) => onCartQty(l.lineId, v)} />
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            lineId: l.lineId,
                            item: it,
                            initial: { qty: l.qty, note: l.note, optionIds: l.optionIds },
                          })
                        }
                        className="text-xs text-primary hover:underline"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => onCartRemove(l.lineId)}
                        aria-label="Bỏ khỏi giỏ"
                        className="text-xs text-status-late hover:underline"
                      >
                        Bỏ
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-md flex flex-col gap-sm">
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Tên khách (tùy chọn)
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="VD: Anh Nam" />
            </label>
            <label className="flex flex-col gap-xxs text-sm text-slate">
              SĐT (tùy chọn)
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={20} placeholder="09xx xxx xxx" />
            </label>
          </div>

          <button
            type="button"
            onClick={create}
            disabled={creating || cart.length === 0}
            className="mt-md flex h-12 w-full items-center justify-center gap-sm rounded-md bg-primary text-sm font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Tạo đơn mang về${cart.length > 0 ? ` · ${formatVnd(cartTotal)}` : ""}`
            )}
          </button>
        </div>

        {/* ---- Đơn mang về đang chờ ---- */}
        {orders.length > 0 && (
          <div className="mt-lg">
            <p className="text-sm font-medium text-ink">Đơn đang chờ ({orders.length})</p>
            <div className="mt-sm flex flex-col gap-md">
              {orders.map((o) => (
                <div key={o.id} className="rounded-lg border border-hairline-soft p-md">
                  <div className="flex items-start justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        Đơn{o.kitchenNo != null ? ` #${o.kitchenNo}` : ""}
                        <span className="ml-xs text-xs font-normal text-steel">{hhmm(o.createdAt)}</span>
                      </p>
                      {o.contact?.name && (
                        <p className="text-xs text-primary">
                          {o.contact.name}
                          {o.contact.phone ? ` · ${o.contact.phone}` : ""}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => getPrintAdapter().printKitchenTicket({ slug, orderId: o.id })}
                      className="inline-flex h-8 shrink-0 items-center gap-xxs rounded-md border border-hairline-strong px-sm text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      <Printer className="h-3.5 w-3.5" /> In phiếu bếp
                    </button>
                  </div>

                  <ul className="mt-sm flex flex-col divide-y divide-hairline-soft">
                    {o.items.map((it) => (
                      <li key={it.id} className="flex items-start justify-between gap-md py-xs">
                        <div className="min-w-0">
                          <p className="text-sm text-ink">{it.qty}× {it.name}</p>
                          {it.modifiers.length > 0 && <p className="text-xs text-steel">{it.modifiers.join(" · ")}</p>}
                          {it.note && <p className="text-xs italic text-stone">“{it.note}”</p>}
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-steel">{formatVnd(it.unitPrice * it.qty)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-sm flex items-center justify-between border-t border-hairline-soft pt-sm">
                    <span className="text-sm font-semibold tabular-nums text-ink">{formatVnd(o.total)}</span>
                    <button
                      type="button"
                      onClick={() => openPayment(o.id)}
                      disabled={openingId === o.id}
                      className="inline-flex h-10 items-center justify-center gap-sm rounded-md bg-primary px-lg text-sm font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                    >
                      {openingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Thu tiền & hoàn tất"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {payBill && (
        <PaymentDialog
          bill={payBill}
          busy={paying}
          onPay={async (method: PaymentMethod, amountReceived: number) => {
            setPaying(true);
            const res = await payOnlineBillAction(slug, payBill.id, { method, amountReceived });
            setPaying(false);
            if (!res.ok) return { ok: false, error: res.error };
            router.refresh();
            return { ok: true, change: res.change };
          }}
          onPrint={() => getPrintAdapter().printReceipt({ slug, billId: payBill.id })}
          onClose={() => setPayBill(null)}
        />
      )}

      <ModifierSheet
        item={editing?.item ?? null}
        open={editing !== null}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        initialLine={editing?.initial ?? null}
        submitLabel="Cập nhật"
        presentation="dialog"
        onAdd={(pending) => {
          if (editing) {
            onCartEdit(editing.lineId, pending);
            setEditing(null);
          }
        }}
      />
    </div>
  );
}
