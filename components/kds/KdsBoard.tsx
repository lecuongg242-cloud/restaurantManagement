"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useResumeRefresh } from "@/components/pos/use-resume-refresh";
import { Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { KdsTicket as KdsTicketType } from "@/lib/orders/kds";
import type { CustomerMenu } from "@/lib/orders/customer-menu";
import { KdsTicket } from "./KdsTicket";
import { SoldOutDrawer } from "./SoldOutDrawer";
import { CauInBar } from "@/components/pos/CauInBanner";
import { splitKdsColumns } from "@/lib/orders/kds-columns";
import { markItemsReadyAction, undoItemReadyAction } from "@/app/r/[slug]/kds/actions";

/**
 * KdsBoard (§4.3, ORDER-04). P27 (QD-032, sửa QD-007 "chỉ để xem"): hai cột như KiotViet — **Chờ chế biến** (vé cũ → mới,
 * nút "Xong" từng món / "Xong cả vé") và **Đã xong – chờ mang ra** (nút "Trả lại" khi bấm nhầm). Món rời màn khi phục vụ bấm
 * "Mang ra" ở POS, khi hủy, hoặc khi thanh toán. Badge delta = (thấy vé lần đầu − confirmed_at) giây → công cụ đo ≤3s.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { todo, done } = useMemo(() => splitKdsColumns(initial), [initial]);
  const doneCount = done.reduce((n, t) => n + t.items.length, 0);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn().catch(() => ({ ok: false as const, error: "Mất kết nối — thử lại." }));
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  const onReady = (ids: string[]) => run(() => markItemsReadyAction(slug, ids));
  const onUndo = (id: string) => run(() => undoItemReadyAction(slug, id));

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
          Chờ chế biến <span className="text-steel">({todo.length})</span>
          <span className="ml-md text-base font-medium text-status-ready">
            Đã xong – chờ mang ra <span className="tabular-nums">({doneCount})</span>
          </span>
        </h2>
        <div className="flex items-center gap-md">
          <span className="hidden text-xs text-steel xl:inline">Xếp cũ → mới · rời màn khi phục vụ mang ra</span>
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

      {error && (
        <p role="alert" className="border-b border-status-late bg-cream-soft px-lg py-xs text-sm text-status-late">
          {error}
        </p>
      )}

      {/* Màn rộng: hai cột cạnh nhau, mỗi cột cuộn riêng. Màn hẹp: xếp chồng, Chờ chế biến ở trên. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section aria-label="Chờ chế biến" className="p-md lg:min-h-0 lg:flex-[2] lg:overflow-y-auto">
          {todo.length === 0 ? (
            <p className="mt-xl text-center text-steel">Chưa có vé nào chờ làm.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-md sm:grid-cols-2 2xl:grid-cols-3">
              {/* data-order-id: mốc để E2E neo đúng vé của đơn đang test (DB dev còn vé cũ). */}
              {todo.map((t) => (
                <li key={t.orderId} data-order-id={t.orderId}>
                  <KdsTicket ticket={t} delta={deltas[t.orderId]} busy={pending} onReady={onReady} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          aria-label="Đã xong – chờ mang ra"
          className="border-t border-hairline bg-status-ready-bg/30 p-md lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:border-l lg:border-t-0"
        >
          <h3 className="mb-sm text-sm font-semibold text-status-ready">
            Đã xong – chờ mang ra ({doneCount})
          </h3>
          {done.length === 0 ? (
            <p className="text-sm text-steel">Chưa có món nào chờ mang ra.</p>
          ) : (
            <ul className="flex flex-col gap-sm">
              {done.map((t) => (
                <li key={t.orderId} data-done-order-id={t.orderId}>
                  <KdsTicket ticket={t} delta={undefined} mode="done" busy={pending} onUndo={onUndo} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <SoldOutDrawer slug={slug} menu={menu} open={soldOutOpen} onOpenChange={setSoldOutOpen} />
    </div>
  );
}
