"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { KdsTicket as KdsTicketType } from "@/lib/orders/kds";
import { KdsTicket } from "./KdsTicket";

/**
 * KdsBoard (§4.3, ORDER-04) — BẢNG BẾP CHỈ ĐỂ XEM (bếp không chạm — QĐ 22/07). Vé confirmed hiện
 * realtime, xếp cũ→mới (FIFO); vé tự ẩn khi phục vụ hết món (POS bấm "Đã phục vụ"). Không nút thao
 * tác trên bếp. Badge delta = (thấy vé lần đầu − confirmed_at) giây, chốt 1 lần → công cụ đo ≤3s.
 */
export function KdsBoard({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: KdsTicketType[];
}) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  // Realtime → refresh. Gắn JWT đăng nhập (setAuth) — nếu không, postgres_changes bị RLS chặn.
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
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-hairline bg-canvas px-lg py-sm">
        <h2 className="text-lg font-semibold text-ink">
          Vé đang chờ làm <span className="text-steel">({initial.length})</span>
        </h2>
        <span className="text-xs text-steel">Xếp cũ → mới · tự ẩn khi phục vụ</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-md">
        {initial.length === 0 ? (
          <p className="mt-hero text-center text-steel">Chưa có vé nào.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {initial.map((t) => (
              <li key={t.orderId}>
                <KdsTicket ticket={t} delta={deltas[t.orderId]} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
