"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { KdsTicket as KdsTicketType } from "@/lib/orders/kds";
import type { OrderItemStatus } from "@/lib/orders/types";
import { KdsTicket } from "./KdsTicket";

/**
 * KdsBoard (§4.3, ORDER-04) — 3 cột Chờ làm · Đang làm · Sẵn sàng. Nhận vé initial từ server;
 * subscribe postgres_changes (orders/order_items filter tenant_id) → router.refresh (không reload).
 * Badge delta = (client thấy vé lần đầu − confirmed_at) giây, chốt 1 lần → công cụ đo ≤3s.
 * Vé nằm ở cột của item "thấp" nhất (queued < preparing < ready).
 */
const COLUMNS: { key: OrderItemStatus; title: string }[] = [
  { key: "queued", title: "Chờ làm" },
  { key: "preparing", title: "Đang làm" },
  { key: "ready", title: "Sẵn sàng" },
];

function ticketColumn(items: { status: OrderItemStatus }[]): OrderItemStatus {
  if (items.some((i) => i.status === "queued")) return "queued";
  if (items.some((i) => i.status === "preparing")) return "preparing";
  return "ready";
}

export function KdsBoard({
  slug,
  tenantId,
  initial,
}: {
  slug: string;
  tenantId: string;
  initial: KdsTicketType[];
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  // Realtime → refresh (gộp 300ms). Gắn JWT đăng nhập vào realtime (setAuth) — không có thì
  // postgres_changes bị RLS chặn (anon nhận 0 event → phải reload thủ công).
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const schedule = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 300);
    };
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`kds:${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` }, schedule)
        .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `tenant_id=eq.${tenantId}` }, schedule)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  // Chốt delta lần đầu vé xuất hiện (đo ORDER-04).
  useEffect(() => {
    setDeltas((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const t of initial) {
        if (t.confirmedAt && next[t.orderId] === undefined) {
          next[t.orderId] = Math.max(0, (Date.now() - new Date(t.confirmedAt).getTime()) / 1000);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initial]);

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-px bg-hairline">
      {COLUMNS.map((col) => {
        const tickets = initial.filter((t) => ticketColumn(t.items) === col.key);
        return (
          <section key={col.key} className="flex min-h-0 flex-col bg-surface">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-canvas px-md py-sm">
              <h2 className="text-lg font-semibold text-ink">{col.title}</h2>
              <span className="grid h-7 min-w-[28px] place-items-center rounded-full bg-ink px-1.5 text-sm font-bold text-on-dark">
                {tickets.length}
              </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-md">
              <ul className="flex flex-col gap-md">
                {tickets.map((t) => (
                  <li key={t.orderId}>
                    <KdsTicket slug={slug} ticket={t} delta={deltas[t.orderId]} />
                  </li>
                ))}
              </ul>
              {tickets.length === 0 && (
                <p className="mt-lg text-center text-sm text-steel">Trống</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
