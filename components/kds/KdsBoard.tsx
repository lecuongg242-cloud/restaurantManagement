"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useResumeRefresh } from "@/components/pos/use-resume-refresh";
import { Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { KdsTicket as KdsTicketType } from "@/lib/orders/kds";
import type { CustomerMenu } from "@/lib/orders/customer-menu";
import { KdsTicket } from "./KdsTicket";
import { SoldOutDrawer } from "./SoldOutDrawer";
import { CauInBar } from "@/components/pos/CauInBanner";

/**
 * KdsBoard (§4.3, ORDER-04) — BẢNG VÉ CHỈ ĐỂ XEM (bếp không chạm vé — QĐ 22/07). Vé confirmed hiện
 * realtime, xếp cũ→mới (FIFO); vé tự ẩn khi phục vụ hết món (POS bấm "Đã phục vụ"). Badge delta =
 * (thấy vé lần đầu − confirmed_at) giây, chốt 1 lần → công cụ đo ≤3s.
 *
 * Ngoại lệ DUY NHẤT về thao tác: nút "Báo hết món" (MENU-04) — đổi tình trạng THỰC ĐƠN, không đổi
 * trạng thái vé, nên không phá quy tắc trên.
 */
export function KdsBoard({
  slug,
  tenantId,
  initial,
  menu,
}: {
  slug: string;
  tenantId: string;
  initial: KdsTicketType[];
  menu: CustomerMenu | null;
}) {
  const router = useRouter();
  // Máy ngủ dậy / có mạng lại → tải lại: realtime nối lại nhưng không phát lại thay đổi đã lỡ (ORDER-19).
  useResumeRefresh(() => router.refresh());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [soldOutOpen, setSoldOutOpen] = useState(false);

  const soldOutCount = useMemo(
    () => (menu?.categories ?? []).flatMap((c) => c.items).filter((i) => !i.is_available).length,
    [menu]
  );

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
      <CauInBar slug={slug} />
      <header className="flex items-center justify-between gap-md border-b border-hairline bg-canvas px-lg py-sm">
        <h2 className="text-lg font-semibold text-ink">
          Vé đang chờ làm <span className="text-steel">({initial.length})</span>
        </h2>
        <div className="flex items-center gap-md">
          <span className="hidden text-xs text-steel sm:inline">Xếp cũ → mới · tự ẩn khi phục vụ</span>
          {/* Không phải thao tác trên VÉ — chỉ báo tình trạng thực đơn (MENU-04). */}
          <button
            type="button"
            onClick={() => setSoldOutOpen(true)}
            style={{ touchAction: "manipulation" }}
            className="inline-flex min-h-11 items-center gap-xs rounded-md border border-hairline-strong px-md text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Ban className="h-4 w-4" aria-hidden />
            Báo hết món
            {soldOutCount > 0 && (
              <span className="rounded-full bg-status-late px-xs text-xs text-status-late-fg tabular-nums">
                {soldOutCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-md">
        {initial.length === 0 ? (
          <p className="mt-hero text-center text-steel">Chưa có vé nào.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {/* data-order-id: mốc để E2E neo đúng vé của đơn đang test (DB dev còn vé cũ). */}
            {initial.map((t) => (
              <li key={t.orderId} data-order-id={t.orderId}>
                <KdsTicket ticket={t} delta={deltas[t.orderId]} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <SoldOutDrawer slug={slug} menu={menu} open={soldOutOpen} onOpenChange={setSoldOutOpen} />
    </div>
  );
}
