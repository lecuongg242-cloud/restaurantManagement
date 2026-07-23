"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, ShoppingBag, Printer, Receipt } from "lucide-react";
import type { CustomerMenuItem } from "@/lib/orders/customer-menu";
import type { PosTable, PosSession } from "@/lib/orders/pos";
import type { CartLine, OrderItemStatus } from "@/lib/orders/types";
import { formatVnd, unitPrice } from "@/lib/orders/cart";
import { getPrintAdapter } from "@/lib/print/adapter";
import { closeSession } from "@/app/r/[slug]/pos/actions";
import { QtyStepper } from "@/components/customer/QtyStepper";
import { ModifierSheet, type PendingLine } from "@/components/customer/ModifierSheet";
import { CancelItemDialog, type CancelStaff } from "./CancelItemDialog";

/**
 * OrderPanel (POS cột giữa) — đơn của bàn đang chọn: món đã gọi (phục vụ/hủy) + giỏ "đang thêm"
 * (từ MenuPanel bên phải) + "Xác nhận thêm" (một staff order) + đóng phiên. Đóng phiên chỉ khi
 * mọi món served/cancelled (quyết định #2).
 */
export function OrderPanel({
  slug,
  table,
  session,
  cart,
  itemMap,
  onCartQty,
  onCartRemove,
  onCartEdit,
  onConfirmAdd,
  adding,
  addError,
  cancelStaff,
  canCancelWithoutPin,
  onOpenBill,
  openingBill,
  onClose,
}: {
  slug: string;
  table: PosTable;
  session: PosSession | null;
  cart: CartLine[];
  itemMap: Map<string, CustomerMenuItem>;
  onCartQty: (lineId: string, qty: number) => void;
  onCartRemove: (lineId: string) => void;
  onCartEdit: (lineId: string, line: PendingLine) => void;
  onConfirmAdd: () => void;
  adding: boolean;
  addError: string | null;
  cancelStaff: CancelStaff[];
  canCancelWithoutPin: boolean;
  onOpenBill: () => void;
  openingBill: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cancelItem, setCancelItem] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<{
    lineId: string;
    item: CustomerMenuItem;
    initial: { qty: number; note: string; optionIds: string[] };
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Escape đóng panel (trừ khi dialog hủy đang mở — vaul tự xử lý Escape của nó).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !cancelItem) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelItem, onClose]);

  const allItems = (session?.orders ?? []).flatMap((o) => o.items);
  const activeItems = allItems.filter((i) => i.status !== "cancelled");
  // 'served' = đã thu đủ (payBill đánh dấu). Bình thường phiên tự đóng khi thu hết; nút này chỉ
  // hữu ích khi bàn toàn món đã hủy (không doanh thu) — cho phép dọn bàn.
  const canClose = !!session && activeItems.every((i) => i.status === "served");
  const sessionTotal = activeItems.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const cartTotal = cart.reduce((s, l) => {
    const it = itemMap.get(l.itemId);
    return it ? s + unitPrice(it, l.optionIds) * l.qty : s;
  }, 0);

  const cartOptionNames = (item: CustomerMenuItem, optionIds: string[]) => {
    const set = new Set(optionIds);
    const names: string[] = [];
    for (const g of item.groups) for (const o of g.options) if (set.has(o.id)) names.push(o.name);
    return names;
  };

  const doClose = async () => {
    if (!session) return;
    setBusy("close");
    setError(null);
    const res = await closeSession(slug, session.id);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else {
      onClose();
      router.refresh();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
        <div>
          <h2 className="font-display text-xl text-ink">Bàn {table.name}</h2>
          {session && (
            <p className="text-xs text-steel">
              Mở lúc{" "}
              {new Date(session.opened_at).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Bỏ chọn bàn"
          className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {(error || addError) && (
        <p role="alert" className="mx-lg mt-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
          {error ?? addError}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
        {/* Món đã gọi — nhóm theo order, mỗi order in phiếu bếp riêng */}
        {session && session.orders.length > 0 ? (
          <div className="flex flex-col gap-lg">
            {session.orders.map((order) => (
              <div key={order.id}>
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      Đơn {order.kitchen_no != null ? `#${order.kitchen_no}` : `#${order.id.slice(-6).toUpperCase()}`}
                      <span className="ml-xs text-xs font-normal text-steel">
                        {new Date(order.created_at).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {order.source === "qr" ? " · QR" : " · POS"}
                      </span>
                    </p>
                    {order.customer_contact?.name && (
                      <p className="text-xs text-primary">
                        {order.customer_contact.name}
                        {order.customer_contact.phone ? ` · ${order.customer_contact.phone}` : ""}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => getPrintAdapter().printKitchenTicket({ slug, orderId: order.id })}
                    className="inline-flex h-8 shrink-0 items-center gap-xxs rounded-md border border-hairline-strong px-sm text-xs font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <Printer className="h-3.5 w-3.5" /> In phiếu bếp
                  </button>
                </div>
                <ul className="mt-xs flex flex-col divide-y divide-hairline-soft">
                  {order.items.map((it) => (
                    <li key={it.id} className="flex items-start justify-between gap-md py-sm">
                      <div className="min-w-0">
                        <p
                          className={
                            "text-sm text-ink " + (it.status === "cancelled" ? "line-through opacity-60" : "")
                          }
                        >
                          {it.qty}× {it.name}
                        </p>
                        {it.modifiers.length > 0 && (
                          <p className="text-xs text-steel">{it.modifiers.join(" · ")}</p>
                        )}
                        {it.note && <p className="text-xs italic text-stone">“{it.note}”</p>}
                        {it.status === "cancelled" && it.cancel_reason && (
                          <p className="text-xs text-status-late">Đã hủy · {it.cancel_reason}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-xs">
                        {/* Chỉ đánh dấu món đã thu; món đang chờ để trống (POS lo tính tiền, không theo dõi bếp). */}
                        {it.status === "served" && <ItemStatusBadge status={it.status} />}
                        {it.status !== "served" && it.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() => setCancelItem({ id: it.id, name: it.name })}
                            className="inline-flex h-8 items-center rounded-md px-sm text-xs font-medium text-status-late hover:bg-cream-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-late focus-visible:ring-offset-2"
                          >
                            Hủy
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-lg text-center text-sm text-steel">
            {session ? "Phiên chưa có món." : "Bàn trống. Chạm món ở thực đơn để mở phiên."}
          </p>
        )}

        {/* Giỏ đang thêm */}
        {cart.length > 0 && (
          <div className="mt-lg rounded-lg border border-primary/40 bg-cream-soft p-md">
            <p className="flex items-center gap-xs text-sm font-medium text-ink">
              <ShoppingBag className="h-4 w-4 text-primary" /> Đang thêm ({cart.length})
            </p>
            <ul className="mt-sm flex flex-col gap-sm">
              {cart.map((l) => {
                const it = itemMap.get(l.itemId);
                if (!it) return null;
                const names = cartOptionNames(it, l.optionIds);
                return (
                  <li key={l.lineId} className="flex items-center justify-between gap-sm">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{it.name}</p>
                      {names.length > 0 && (
                        <p className="text-xs text-steel">{names.join(" · ")}</p>
                      )}
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
            <button
              type="button"
              onClick={onConfirmAdd}
              disabled={adding}
              className="mt-md flex h-11 w-full items-center justify-center gap-sm rounded-md bg-primary text-sm font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Xác nhận thêm ${cart.length} món · ${formatVnd(cartTotal)}`
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer: tạm tính + đóng phiên */}
      <div className="border-t border-hairline-soft px-lg py-md">
        {session && activeItems.length > 0 && (
          <div className="mb-sm flex items-center justify-between text-sm">
            <span className="text-steel">Tạm tính</span>
            <span className="font-semibold tabular-nums text-ink">{formatVnd(sessionTotal)}</span>
          </div>
        )}
        {session && activeItems.length > 0 && (
          <button
            type="button"
            disabled={openingBill}
            onClick={onOpenBill}
            className="mb-sm inline-flex h-11 w-full items-center justify-center gap-sm rounded-md bg-primary px-md text-sm font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {openingBill ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Receipt className="h-4 w-4" />
                {session.openBill
                  ? `Xem hóa đơn${session.openBill.bill_no != null ? ` #${session.openBill.bill_no}` : ""}`
                  : "Tính tiền"}
              </>
            )}
          </button>
        )}
        {session && (
          <button
            type="button"
            disabled={!canClose || busy === "close"}
            onClick={doClose}
            title={canClose ? "" : "Cần thu tiền hết trước khi đóng phiên"}
            className="inline-flex h-11 w-full items-center justify-center rounded-md border border-hairline-strong px-md text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {busy === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Đóng phiên"}
          </button>
        )}
      </div>

      <CancelItemDialog
        slug={slug}
        item={cancelItem}
        open={cancelItem !== null}
        onOpenChange={(v) => !v && setCancelItem(null)}
        cancelStaff={cancelStaff}
        canCancelWithoutPin={canCancelWithoutPin}
        onDone={() => setCancelItem(null)}
      />

      {/* Sửa tùy chọn dòng "đang thêm" (giữ nguyên lựa chọn cũ) */}
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

function ItemStatusBadge({ status }: { status: OrderItemStatus }) {
  const map: Record<OrderItemStatus, { label: string; cls: string }> = {
    queued: { label: "Chờ làm", cls: "bg-status-new text-status-new-fg" },
    preparing: { label: "Đang làm", cls: "bg-status-active text-status-active-fg" },
    ready: { label: "Sẵn sàng", cls: "bg-status-ready-bg text-status-ready" },
    served: { label: "Đã thu", cls: "bg-surface text-steel" },
    cancelled: { label: "Đã hủy", cls: "bg-cream-soft text-status-late" },
  };
  const s = map[status];
  return <span className={"rounded px-1.5 py-0.5 text-[11px] font-medium " + s.cls}>{s.label}</span>;
}
