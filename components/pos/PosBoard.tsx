"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CustomerMenu, CustomerMenuItem } from "@/lib/orders/customer-menu";
import type { PosSnapshot } from "@/lib/orders/pos";
import type { CartLine } from "@/lib/orders/types";
import { createStaffOrderAction } from "@/app/r/[slug]/pos/actions";
import type { PendingLine } from "@/components/customer/ModifierSheet";
import { TableMap } from "./TableMap";
import { OrderPanel } from "./OrderPanel";
import { MenuPanel } from "./MenuPanel";
import { PendingOrdersDrawer } from "./PendingOrdersDrawer";
import type { CancelStaff } from "./CancelItemDialog";

/**
 * PosBoard (§4.2, bố cục 3 cột) — Sơ đồ bàn (trái) · Đơn bàn (giữa) · Thực đơn (phải).
 * Menu luôn hiển thị; chạm món → giỏ "đang thêm" của bàn đang chọn (nâng state ở đây) →
 * "Xác nhận thêm" tạo một staff order. Realtime postgres_changes → router.refresh (không reload).
 */
export function PosBoard({
  slug,
  tenantId,
  initial,
  menu,
  cancelStaff,
  canCancelWithoutPin,
}: {
  slug: string;
  tenantId: string;
  initial: PosSnapshot;
  menu: CustomerMenu | null;
  cancelStaff: CancelStaff[];
  canCancelWithoutPin: boolean;
}) {
  const router = useRouter();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime → refresh (gộp 400ms). QUAN TRỌNG: gắn JWT đăng nhập vào kênh realtime
  // (realtime.setAuth) — nếu không, postgres_changes bị RLS chặn (anon nhận 0 event).
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 400);
    };
    // Cập nhật token khi Supabase tự refresh (ca dài) để realtime không rớt.
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`pos:${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `tenant_id=eq.${tenantId}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `tenant_id=eq.${tenantId}` }, scheduleRefresh)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  // Đổi bàn → xóa giỏ đang thêm.
  useEffect(() => {
    setCart([]);
    setAddError(null);
  }, [selectedTableId]);

  const itemMap = useMemo(() => {
    const m = new Map<string, CustomerMenuItem>();
    for (const c of menu?.categories ?? []) for (const it of c.items) m.set(it.id, it);
    return m;
  }, [menu]);

  const sessionByTable = useMemo(() => {
    const m = new Map<string, PosSnapshot["sessions"][number]>();
    for (const s of initial.sessions) m.set(s.tableId, s);
    return m;
  }, [initial.sessions]);

  const selectedTable = initial.tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedSession = selectedTableId ? sessionByTable.get(selectedTableId) ?? null : null;

  const addLine = (line: PendingLine) =>
    setCart((prev) => [
      ...prev,
      { lineId: crypto.randomUUID(), itemId: line.itemId, qty: line.qty, note: line.note, optionIds: line.optionIds },
    ]);
  const cartQty = (lineId: string, qty: number) =>
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l)));
  const cartRemove = (lineId: string) => setCart((prev) => prev.filter((l) => l.lineId !== lineId));

  const confirmAdd = async () => {
    if (!selectedTableId || cart.length === 0) return;
    setAdding(true);
    setAddError(null);
    const res = await createStaffOrderAction(
      slug,
      selectedTableId,
      cart.map((l) => ({ itemId: l.itemId, qty: l.qty, note: l.note, optionIds: l.optionIds }))
    );
    setAdding(false);
    if (!res.ok) setAddError(res.error);
    else {
      setCart([]);
      router.refresh();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-md border-b border-hairline-soft bg-canvas px-lg py-sm">
        <span className="text-sm text-steel">
          {initial.tables.length} bàn ·{" "}
          {initial.tables.filter((t) => t.status === "occupied").length} đang phục vụ
        </span>
        <button
          type="button"
          onClick={() => setPendingOpen(true)}
          aria-label={`Order chờ duyệt${initial.pending.length > 0 ? `, ${initial.pending.length} đơn` : ""}`}
          className="relative inline-flex h-11 items-center gap-sm rounded-md border border-hairline-strong bg-canvas px-md text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Bell className="h-4 w-4" />
          Chờ duyệt
          {initial.pending.length > 0 && (
            <span className="grid h-6 min-w-[24px] place-items-center rounded-full bg-status-new px-1 text-xs font-bold text-status-new-fg">
              {initial.pending.length}
            </span>
          )}
        </button>
      </div>

      {/* 3 cột: bàn (trái) · thực đơn (giữa) · đơn bàn (phải) */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-hairline-soft p-md lg:w-96">
          <TableMap
            areas={initial.areas}
            tables={initial.tables}
            sessions={initial.sessions}
            selectedTableId={selectedTableId}
            onSelect={setSelectedTableId}
          />
        </aside>

        <section className="min-h-0 min-w-0 flex-1">
          <MenuPanel menu={menu} canAdd={!!selectedTable} onAddLine={addLine} />
        </section>

        <aside className="w-[26rem] shrink-0 border-l border-hairline-soft lg:w-[30rem]">
          {selectedTable ? (
            <OrderPanel
              slug={slug}
              table={selectedTable}
              session={selectedSession}
              cart={cart}
              itemMap={itemMap}
              onCartQty={cartQty}
              onCartRemove={cartRemove}
              onConfirmAdd={confirmAdd}
              adding={adding}
              addError={addError}
              cancelStaff={cancelStaff}
              canCancelWithoutPin={canCancelWithoutPin}
              onClose={() => setSelectedTableId(null)}
            />
          ) : (
            <div className="grid h-full place-items-center p-lg text-center text-sm text-steel">
              Chọn một bàn để xem đơn.
            </div>
          )}
        </aside>
      </div>

      <PendingOrdersDrawer
        slug={slug}
        open={pendingOpen}
        onOpenChange={setPendingOpen}
        pending={initial.pending}
      />
    </div>
  );
}
