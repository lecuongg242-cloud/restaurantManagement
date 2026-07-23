"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/orders/cart";
import { getPrintAdapter } from "@/lib/print/adapter";
import { PaymentDialog } from "@/components/pos/PaymentDialog";
import type { BillView, PaymentMethod } from "@/lib/billing/types";
import type { OnlineOrderView } from "@/lib/orders/online";
import {
  acceptOnlineOrderAction,
  rejectOnlineOrderAction,
  markReadyOnlineOrderAction,
  openOnlineBillAction,
  payOnlineBillAction,
} from "@/app/r/[slug]/pos/actions";

const VN_OFFSET = 7 * 3600 * 1000;
function hhmm(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET).toISOString().slice(11, 16);
}

function channelLabel(c: OnlineOrderView["channel"]): string {
  return c === "takeaway" ? "Mang về" : "Giao tận nơi";
}

export function OnlineQueue({
  slug,
  tenantId,
  orders,
}: {
  slug: string;
  tenantId: string;
  orders: OnlineOrderView[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payBill, setPayBill] = useState<BillView | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime: đơn mới / đổi trạng thái → refresh (gộp 400ms). setAuth để RLS không chặn.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 400);
    };
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`online:${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
          scheduleRefresh
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  function run(id: string, fn: () => Promise<{ ok: true } | { error: string }>, after?: () => void) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if ("error" in res) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function onOpenBill(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await openOnlineBillAction(slug, id);
      setBusyId(null);
      if (!res.ok) setError(res.error);
      else setPayBill(res.bill);
    });
  }

  const pending = orders.filter((o) => o.status === "pending_confirm");
  const active = orders.filter((o) => o.status === "confirmed" || o.status === "ready");

  return (
    <div className="mt-lg">
      {error && (
        <p role="alert" className="mb-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late">
          {error}
        </p>
      )}

      <div className="grid gap-lg md:grid-cols-2">
        {/* Chờ xác nhận */}
        <section>
          <h2 className="flex items-center gap-sm text-sm font-medium text-ink">
            Chờ xác nhận
            <span className="rounded-full border border-primary/30 bg-cream px-sm py-xxs text-xs font-medium text-primary">
              {pending.length}
            </span>
          </h2>
          {pending.length === 0 ? (
            <p className="mt-sm rounded-lg border border-dashed border-hairline-strong px-md py-lg text-center text-sm text-muted">
              Không có đơn chờ.
            </p>
          ) : (
            <ul className="mt-sm flex flex-col gap-sm">
              {pending.map((o) => {
                const busy = busyId === o.id && isPending;
                return (
                  <li key={o.id} className="rounded-lg border border-hairline-soft bg-canvas p-lg">
                    <OrderHeader order={o} />
                    <OrderBody order={o} />
                    <div className="mt-md border-t border-hairline-soft pt-md">
                      {rejectingId === o.id ? (
                        <div className="flex flex-col gap-sm">
                          <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Lý do từ chối (bắt buộc)"
                            maxLength={300}
                            autoFocus
                          />
                          <div className="flex gap-sm">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busy || !reason.trim()}
                              onClick={() =>
                                run(o.id, () => rejectOnlineOrderAction(slug, o.id, reason), () => {
                                  setRejectingId(null);
                                  setReason("");
                                })
                              }
                            >
                              {busy ? "Đang lưu…" : "Xác nhận từ chối"}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setRejectingId(null);
                                setReason("");
                              }}
                            >
                              Hủy
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-sm">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={() => run(o.id, () => acceptOnlineOrderAction(slug, o.id))}
                          >
                            {busy ? "Đang lưu…" : "Nhận đơn"}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setError(null);
                              setRejectingId(o.id);
                              setReason("");
                            }}
                          >
                            Từ chối
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Đang xử lý */}
        <section>
          <h2 className="flex items-center gap-sm text-sm font-medium text-ink">
            Đang xử lý
            <span className="rounded-full border border-hairline-strong bg-surface px-sm py-xxs text-xs font-medium text-steel">
              {active.length}
            </span>
          </h2>
          {active.length === 0 ? (
            <p className="mt-sm rounded-lg border border-dashed border-hairline-strong px-md py-lg text-center text-sm text-muted">
              Chưa có đơn đang làm.
            </p>
          ) : (
            <ul className="mt-sm flex flex-col gap-sm">
              {active.map((o) => {
                const busy = busyId === o.id && isPending;
                return (
                  <li key={o.id} className="rounded-lg border border-hairline-soft bg-canvas p-lg">
                    <OrderHeader order={o} />
                    <OrderBody order={o} />
                    <div className="mt-md border-t border-hairline-soft pt-md">
                      {o.status === "confirmed" ? (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => run(o.id, () => markReadyOnlineOrderAction(slug, o.id))}
                        >
                          {busy ? "Đang lưu…" : "Đánh dấu sẵn sàng"}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-sm">
                          <span className="rounded-full border border-status-ready bg-status-ready-bg px-sm py-xxs text-xs font-medium text-status-ready">
                            Sẵn sàng
                          </span>
                          <Button variant="primary" size="sm" disabled={busy} onClick={() => onOpenBill(o.id)}>
                            {busy ? "Đang mở…" : "Thu tiền & hoàn tất"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {payBill && (
        <PaymentDialog
          bill={payBill}
          busy={isPending}
          onPay={async (method: PaymentMethod, amountReceived: number) => {
            const res = await payOnlineBillAction(slug, payBill.id, { method, amountReceived });
            if (!res.ok) return { ok: false, error: res.error };
            return { ok: true, change: res.change };
          }}
          onPrint={() => getPrintAdapter().printReceipt({ slug, billId: payBill.id })}
          onClose={() => {
            setPayBill(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function OrderHeader({ order }: { order: OnlineOrderView }) {
  return (
    <div className="flex items-start justify-between gap-md">
      <div className="flex items-baseline gap-sm">
        {order.kitchenNo != null && (
          <span className="font-display text-xl font-semibold text-primary">#{order.kitchenNo}</span>
        )}
        <span
          className={
            "rounded-md px-sm py-xxs text-xs font-medium " +
            (order.channel === "takeaway" ? "bg-cream text-primary" : "bg-status-ready-bg text-status-ready")
          }
        >
          {channelLabel(order.channel)}
        </span>
      </div>
      <span className="tabular-nums text-xs text-steel">{hhmm(order.createdAt)}</span>
    </div>
  );
}

function OrderBody({ order }: { order: OnlineOrderView }) {
  return (
    <div className="mt-sm flex flex-col gap-xxs">
      <span className="text-sm font-medium text-ink">
        {order.contact.name ?? "—"}
        {order.contact.phone && (
          <>
            {" · "}
            <a href={`tel:${order.contact.phone}`} className="text-primary hover:underline">
              {order.contact.phone}
            </a>
          </>
        )}
      </span>
      {order.channel === "delivery" && order.contact.address && (
        <span className="text-xs text-steel">Giao: {order.contact.address}</span>
      )}
      <ul className="mt-xs flex flex-col gap-xxs">
        {order.items.map((it) => (
          <li key={it.id} className="text-sm text-slate">
            <span className="text-ink">
              {it.qty}× {it.name}
            </span>
            {it.modifiers.length > 0 && <span className="text-steel"> · {it.modifiers.join(", ")}</span>}
            {it.note && <span className="text-steel"> · ✎ {it.note}</span>}
          </li>
        ))}
      </ul>
      {order.note && <span className="text-xs text-steel">Ghi chú đơn: {order.note}</span>}
      <span className="mt-xs text-sm font-semibold tabular-nums text-ink">{formatVnd(order.total)}</span>
    </div>
  );
}
