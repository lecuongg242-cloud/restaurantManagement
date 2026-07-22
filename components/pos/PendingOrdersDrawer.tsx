"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import { Check, X, Loader2 } from "lucide-react";
import type { PosPending } from "@/lib/orders/pos";
import { formatVnd } from "@/lib/orders/cart";
import { getPrintAdapter } from "@/lib/print/adapter";
import { approveOrder, rejectOrder } from "@/app/r/[slug]/pos/actions";

/**
 * PendingOrdersDrawer (§4.2) — danh sách order QR chờ duyệt (realtime qua refresh của PosBoard).
 * Duyệt → confirmed; Từ chối mở ô lý do bắt buộc → cancelled. Server action kiểm transition + role.
 */
export function PendingOrdersDrawer({
  slug,
  open,
  onOpenChange,
  pending,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending: PosPending[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  const doApprove = async (id: string) => {
    setBusyId(id);
    setError(null);
    const res = await approveOrder(slug, id);
    setBusyId(null);
    if (!res.ok) setError(res.error);
    else {
      // Duyệt xong tự mở phiếu bếp để in (qua PrintAdapter — PRINT-01).
      getPrintAdapter().printKitchenTicket({ slug, orderId: id });
      router.refresh();
    }
  };

  const doReject = async (id: string) => {
    if (!reason.trim()) {
      setError("Vui lòng nhập lý do từ chối.");
      return;
    }
    setBusyId(id);
    setError(null);
    const res = await rejectOrder(slug, id, reason);
    setBusyId(null);
    if (!res.ok) {
      setError(res.error);
    } else {
      setRejectingId(null);
      setReason("");
      router.refresh();
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-canvas shadow-modal outline-none">
          <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
            <Drawer.Title className="font-display text-xl text-ink">
              Chờ duyệt ({pending.length})
            </Drawer.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng"
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

          <div className="min-h-0 flex-1 overflow-y-auto p-lg">
            {pending.length === 0 ? (
              <p className="py-xl text-center text-sm text-steel">Không có order chờ duyệt.</p>
            ) : (
              <ul className="flex flex-col gap-md">
                {pending.map((o) => {
                  const total = o.items.reduce((s, it) => s + it.unit_price * it.qty, 0);
                  return (
                    <li key={o.id} className="rounded-lg border border-hairline-soft p-md">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">Bàn {o.tableName}</span>
                        <span className="text-xs text-steel">{time(o.created_at)}</span>
                      </div>
                      <ul className="mt-sm flex flex-col gap-xs">
                        {o.items.map((it) => (
                          <li key={it.id} className="text-sm text-ink">
                            <span className="font-medium">
                              {it.qty}× {it.name}
                            </span>
                            {it.modifiers.length > 0 && (
                              <span className="text-steel"> · {it.modifiers.join(", ")}</span>
                            )}
                            {it.note && <span className="italic text-stone"> · “{it.note}”</span>}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-sm text-sm font-semibold tabular-nums text-primary">
                        {formatVnd(total)}
                      </p>

                      {rejectingId === o.id ? (
                        <div className="mt-md">
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            aria-label="Lý do từ chối order"
                            placeholder="Lý do từ chối (bắt buộc)…"
                            className="h-11 w-full rounded-md border border-hairline px-md text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                          <div className="mt-sm flex gap-sm">
                            <button
                              type="button"
                              disabled={busyId === o.id}
                              onClick={() => doReject(o.id)}
                              className="inline-flex h-11 flex-1 items-center justify-center gap-xs rounded-md bg-status-late text-sm font-medium text-status-late-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-late focus-visible:ring-offset-2 disabled:opacity-60"
                            >
                              {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Xác nhận từ chối"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(null);
                                setReason("");
                                setError(null);
                              }}
                              className="inline-flex h-11 items-center justify-center rounded-md border border-hairline-strong px-md text-sm text-ink"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-md flex gap-sm">
                          <button
                            type="button"
                            disabled={busyId === o.id}
                            onClick={() => doApprove(o.id)}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-xs rounded-md bg-primary text-sm font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                          >
                            {busyId === o.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4" /> Duyệt
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(o.id);
                              setReason("");
                              setError(null);
                            }}
                            className="inline-flex h-11 items-center justify-center rounded-md border border-hairline-strong px-md text-sm text-status-late"
                          >
                            Từ chối
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
