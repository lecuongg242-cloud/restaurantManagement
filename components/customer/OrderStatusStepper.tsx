"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import {
  CUSTOMER_STEPPER,
  CUSTOMER_STEP_LABEL,
  ORDER_STATUS_LABEL,
  isTerminalOrderStatus,
} from "@/lib/orders/status";
import type { OrderStatus, OrderItemStatus } from "@/lib/orders/types";
import { formatVnd } from "@/lib/orders/cart";

type TrackItem = {
  id: string;
  name: string;
  qty: number;
  status: OrderItemStatus;
  unit_price?: number;
  modifiers?: { name_snapshot: string; price_delta_snapshot: number }[];
};

type OrderData = {
  status: OrderStatus;
  cancel_reason: string | null;
  items: TrackItem[];
};

/**
 * order-status-stepper (§5.2, A5) — theo dõi trạng thái order realtime.
 * (1) GET lấy trạng thái ban đầu; (2) subscribe Broadcast channel order:{id} (anon key)
 * cập nhật ngay; (3) fallback polling 15s khi kênh lỗi/mất mạng. Dừng hẳn ở trạng thái cuối.
 */
export function OrderStatusStepper({
  slug,
  orderId,
  qrToken,
}: {
  slug: string;
  orderId: string;
  qrToken: string | null;
}) {
  const [data, setData] = useState<OrderData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/r/${slug}/api/order/${orderId}`, { cache: "no-store" });
        if (!res.ok) {
          if (mounted) setLoadError(true);
          return;
        }
        const json = await res.json();
        if (!mounted) return;
        setLoadError(false);
        setData({
          status: json.status,
          cancel_reason: json.cancel_reason ?? null,
          items: json.items ?? [],
        });
        if (isTerminalOrderStatus(json.status) || json.status === "served") {
          stoppedRef.current = true;
          stopPolling();
        }
      } catch {
        if (mounted) setLoadError(true);
      }
    };

    const startPolling = () => {
      if (pollRef.current || stoppedRef.current) return;
      pollRef.current = setInterval(fetchStatus, 15000);
    };

    // (1) Trạng thái ban đầu.
    fetchStatus();

    // (2) Broadcast realtime.
    const supabase = createClient();
    const channel = supabase.channel(`order:${orderId}`);
    channel
      .on("broadcast", { event: "status" }, ({ payload }) => {
        if (!mounted) return;
        setData({
          status: payload.status,
          cancel_reason: payload.cancel_reason ?? null,
          items: payload.items ?? [],
        });
        if (isTerminalOrderStatus(payload.status) || payload.status === "served") {
          stoppedRef.current = true;
          stopPolling();
          supabase.removeChannel(channel);
        }
      })
      .subscribe((status) => {
        // (3) Kênh lỗi/đóng → bật fallback polling.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling();
        } else if (status === "SUBSCRIBED") {
          // Kênh ổn → dừng polling (giữ 1 lần refetch để chắc chắn).
          stopPolling();
        }
      });

    return () => {
      mounted = false;
      stopPolling();
      supabase.removeChannel(channel);
    };
  }, [slug, orderId]);

  if (loadError && !data) {
    return (
      <div className="mx-auto max-w-md p-lg">
        <p className="rounded-md bg-cream-soft px-md py-sm text-center text-sm text-status-late">
          Không tải được đơn. Vui lòng thử lại.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-lg">
        <div className="h-32 animate-pulse rounded-lg bg-surface" />
      </div>
    );
  }

  const cancelled = data.status === "cancelled";
  // pending_confirm → bước 1 đang chờ; confirmed trở đi → cả 2 bước hoàn tất (dừng ở "Đã xác nhận").
  const currentIdx = data.status === "pending_confirm" ? 0 : CUSTOMER_STEPPER.length;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-canvas p-lg">
      {/* Vùng thông báo động: SR đọc khi trạng thái đổi qua broadcast/polling */}
      <div role="status" aria-live="polite">
      {cancelled ? (
        <div className="flex flex-col items-center rounded-lg border border-status-late bg-cream-soft p-lg text-center">
          <XCircle className="h-10 w-10 text-status-late" />
          <p className="mt-sm font-display text-xl text-ink">Đơn đã bị hủy</p>
          {data.cancel_reason && (
            <p className="mt-xxs text-sm text-steel">Lý do: {data.cancel_reason}</p>
          )}
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl text-ink">
            {data.status === "pending_confirm" ? "Chờ xác nhận" : "Đã xác nhận"}
          </h1>
          <p className="mt-xxs text-sm text-steel">
            {data.status === "pending_confirm"
              ? "Đã gửi, chờ nhân viên xác nhận."
              : "Nhân viên đã xác nhận đơn của bạn. Món sẽ được phục vụ sớm."}
          </p>

          {/* Stepper dọc */}
          <ol className="mt-lg flex flex-col gap-0">
            {CUSTOMER_STEPPER.map((step, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              const isLast = i === CUSTOMER_STEPPER.length - 1;
              return (
                <li key={step} className="flex gap-md">
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold " +
                        (done
                          ? "bg-status-ready text-status-ready-bg"
                          : active
                            ? "bg-primary text-primary-fg"
                            : "bg-surface text-muted")
                      }
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                    </span>
                    {!isLast && (
                      <span
                        className={
                          "my-xxs w-0.5 flex-1 " + (done ? "bg-status-ready" : "bg-hairline")
                        }
                        style={{ minHeight: 20 }}
                      />
                    )}
                  </div>
                  <div className="pb-md pt-1">
                    <span
                      className={
                        "text-sm " +
                        (active ? "font-semibold text-ink" : done ? "text-steel" : "text-muted")
                      }
                    >
                      {CUSTOMER_STEP_LABEL[step] ?? ORDER_STATUS_LABEL[step]}
                    </span>
                    {active && (
                      <motion.span
                        aria-hidden
                        className="ml-sm inline-block h-2 w-2 rounded-full bg-primary align-middle"
                        animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
      </div>

      {/* Danh sách món */}
      <div className="mt-lg rounded-lg border border-hairline-soft p-md">
        <p className="text-sm font-medium text-ink">Món đã gọi</p>
        <ul className="mt-sm flex flex-col divide-y divide-hairline-soft">
          {data.items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-md py-sm">
              <div className="min-w-0">
                <span
                  className={
                    "text-sm text-ink " + (it.status === "cancelled" ? "line-through opacity-60" : "")
                  }
                >
                  {it.qty}× {it.name}
                </span>
                {it.modifiers && it.modifiers.length > 0 && (
                  <p className="text-xs text-steel">
                    {it.modifiers.map((m) => m.name_snapshot).join(" · ")}
                  </p>
                )}
                {it.status === "cancelled" && (
                  <span className="text-xs text-status-late">Đã hủy</span>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end">
                {typeof it.unit_price === "number" && (
                  <span className="text-sm tabular-nums text-steel">
                    {formatVnd(it.unit_price * it.qty)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {qrToken && !cancelled && (
        <Link
          href={`/r/${slug}/menu?t=${qrToken}`}
          className="mt-lg flex h-12 w-full items-center justify-center rounded-md border border-hairline-strong text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Gọi thêm món
        </Link>
      )}
    </div>
  );
}
