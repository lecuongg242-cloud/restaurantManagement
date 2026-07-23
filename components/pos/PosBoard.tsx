"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Check, CalendarClock, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { CustomerMenu, CustomerMenuItem } from "@/lib/orders/customer-menu";
import type { PosSnapshot } from "@/lib/orders/pos";
import type { CartLine } from "@/lib/orders/types";
import {
  createStaffOrderAction,
  openBillAction,
  splitByItemsAction,
  splitByOrdersAction,
  splitEvenlyAction,
  mergeTablesAction,
  applyDiscountAction,
  setChargePctAction,
  payBillAction,
  resolveCallAction,
} from "@/app/r/[slug]/pos/actions";
import type { BillView, PaymentMethod } from "@/lib/billing/types";
import type { SplitPick } from "@/lib/billing/split";
import { getPrintAdapter } from "@/lib/print/adapter";
import type { AdjustPayload } from "./AdjustBillDialog";
import type { PendingLine } from "@/components/customer/ModifierSheet";
import { TableMap } from "./TableMap";
import { OrderPanel } from "./OrderPanel";
import { MenuPanel } from "./MenuPanel";
import { PendingOrdersDrawer } from "./PendingOrdersDrawer";
import { TakeawayPanel } from "./TakeawayPanel";
import { BillPanel } from "./BillPanel";
import type { MergeCandidate } from "./MergeTablesDialog";
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
  allowDiscount,
}: {
  slug: string;
  tenantId: string;
  initial: PosSnapshot;
  menu: CustomerMenu | null;
  cancelStaff: CancelStaff[];
  canCancelWithoutPin: boolean;
  allowDiscount: boolean;
}) {
  const router = useRouter();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [takeawayMode, setTakeawayMode] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [bills, setBills] = useState<BillView[]>([]);
  const [billOpen, setBillOpen] = useState(false);
  const [openingBill, setOpeningBill] = useState(false);
  const [billBusy, setBillBusy] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);
  const [resolvingCall, setResolvingCall] = useState<string | null>(null);
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
        .on("postgres_changes", { event: "*", schema: "public", table: "bills", filter: `tenant_id=eq.${tenantId}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "reservations", filter: `tenant_id=eq.${tenantId}` }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "staff_calls", filter: `tenant_id=eq.${tenantId}` }, scheduleRefresh)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenantId, router]);

  // Đổi bàn → xóa giỏ đang thêm + đóng hóa đơn đang xem.
  useEffect(() => {
    setCart([]);
    setAddError(null);
    setBillOpen(false);
    setBills([]);
    setBillError(null);
  }, [selectedTableId]);

  // Chọn bàn → thoát chế độ mang về. Vào chế độ mang về → bỏ chọn bàn + giỏ sạch.
  const selectTable = (id: string) => {
    setTakeawayMode(false);
    setSelectedTableId(id);
  };
  const enterTakeaway = () => {
    setSelectedTableId(null);
    setTakeawayMode(true);
    setCart([]);
    setAddError(null);
  };
  const exitTakeaway = () => {
    setTakeawayMode(false);
    setCart([]);
  };

  // "Gọi nhân viên" (CALL-01): nhân viên bấm "Đã xử lý" → resolve + refresh.
  const handleResolveCall = async (callId: string) => {
    setResolvingCall(callId);
    await resolveCallAction(slug, callId);
    router.refresh();
    setResolvingCall(null);
  };

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
  const cartEdit = (lineId: string, line: PendingLine) =>
    setCart((prev) =>
      prev.map((l) =>
        l.lineId === lineId ? { ...l, qty: line.qty, note: line.note, optionIds: line.optionIds } : l
      )
    );

  const openBill = async () => {
    if (!selectedSession) return;
    setOpeningBill(true);
    setAddError(null);
    setBillError(null);
    setBillOpen(true);
    setBills([]);
    const res = await openBillAction(slug, selectedSession.id);
    setOpeningBill(false);
    if (!res.ok) {
      setBillOpen(false);
      setAddError(res.error);
    } else {
      setBills(res.bills);
      router.refresh();
    }
  };

  // Bàn khác đang mở, có món (ứng viên gộp bàn) + tổng tạm tính.
  const sessionActiveTotal = (s: PosSnapshot["sessions"][number]) =>
    s.orders
      .flatMap((o) => o.items)
      .filter((i) => i.status !== "cancelled")
      .reduce((sum, i) => sum + i.unit_price * i.qty, 0);

  const mergeCandidates: MergeCandidate[] = useMemo(() => {
    if (!selectedSession) return [];
    return initial.sessions
      .map((s) => {
        const total = s.openBill?.total ?? sessionActiveTotal(s);
        const table = initial.tables.find((t) => t.id === s.tableId);
        return {
          sessionId: s.id,
          tableName: table?.name ?? "—",
          total,
          isCurrent: s.id === selectedSession.id,
        };
      })
      .filter((c) => c.isCurrent || c.total > 0);
  }, [initial.sessions, initial.tables, selectedSession]);

  const runBillAction = async (fn: () => Promise<{ ok: boolean; bills?: BillView[]; error?: string }>) => {
    setBillBusy(true);
    setBillError(null);
    const res = await fn();
    setBillBusy(false);
    if (!res.ok) setBillError(res.error ?? "Thao tác thất bại.");
    else {
      setBills(res.bills ?? []);
      router.refresh();
    }
  };

  const doSplitByItems = (billId: string, picks: SplitPick[]) => {
    if (!selectedSession) return;
    runBillAction(() => splitByItemsAction(slug, selectedSession.id, billId, picks));
  };
  const doSplitByOrders = (billId: string, orderIds: string[]) => {
    if (!selectedSession) return;
    runBillAction(() => splitByOrdersAction(slug, selectedSession.id, billId, orderIds));
  };
  const doSplitEvenly = (billId: string, n: number) => {
    if (!selectedSession) return;
    runBillAction(() => splitEvenlyAction(slug, selectedSession.id, billId, n));
  };
  const doMerge = (sessionIds: string[]) => {
    if (!selectedSession) return;
    runBillAction(() => mergeTablesAction(slug, selectedSession.id, sessionIds));
  };
  const doApplyDiscount = (
    billId: string,
    payload: AdjustPayload,
    creds: { membershipId?: string; pin?: string }
  ) => {
    if (!selectedSession) return;
    runBillAction(() =>
      applyDiscountAction(slug, selectedSession.id, billId, payload, creds.membershipId, creds.pin)
    );
  };
  const doSetCharges = (billId: string, payload: { serviceChargePct: number; vatPct: number }) => {
    if (!selectedSession) return;
    runBillAction(() => setChargePctAction(slug, selectedSession.id, billId, payload));
  };
  const doPay = async (billId: string, method: PaymentMethod, amountReceived: number) => {
    if (!selectedSession) return { ok: false, error: "Chưa chọn bàn." };
    setBillBusy(true);
    setBillError(null);
    const res = await payBillAction(slug, selectedSession.id, billId, { method, amountReceived });
    setBillBusy(false);
    if (!res.ok) return { ok: false, error: res.error };
    setBills(res.bills);
    router.refresh();
    return { ok: true, change: res.change };
  };
  const doPrintReceipt = (billId: string) => getPrintAdapter().printReceipt({ slug, billId });

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
        <div className="flex items-center gap-sm">
          <Link
            href={`/r/${slug}/pos/reservations`}
            className="inline-flex h-11 items-center gap-sm rounded-md border border-hairline-strong bg-canvas px-md text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <CalendarClock className="h-4 w-4" />
            Đặt bàn
          </Link>
          <Link
            href={`/r/${slug}/pos/online`}
            className="inline-flex h-11 items-center gap-sm rounded-md border border-hairline-strong bg-canvas px-md text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ShoppingBag className="h-4 w-4" />
            Đơn online
          </Link>
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
      </div>

      {/* Banner "Gọi nhân viên" (CALL-01) — bàn đang gọi, bấm để đánh dấu đã xử lý */}
      {initial.calls.length > 0 && (
        <div className="flex flex-wrap items-center gap-sm border-b border-hairline-soft bg-cream px-lg py-sm">
          <span className="inline-flex items-center gap-xs text-sm font-semibold text-ink">
            <BellRing className="h-4 w-4 animate-pulse text-primary" />
            Bàn đang gọi ({initial.calls.length})
          </span>
          {initial.calls.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleResolveCall(c.id)}
              disabled={resolvingCall === c.id}
              title={`Bàn ${c.tableName}${c.note ? " — " + c.note : ""} · bấm để đánh dấu đã xử lý`}
              className="group inline-flex min-h-[44px] items-center gap-xs rounded-2xl border border-primary/30 bg-canvas px-md py-xs text-left text-sm font-semibold text-ink transition-colors hover:bg-primary/5 active:bg-primary/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span className="shrink-0">
                Bàn {c.tableName}
                {c.note ? ":" : ""}
              </span>
              {c.note && <span className="font-normal text-slate">{c.note}</span>}
              <Check
                className="h-4 w-4 shrink-0 text-primary transition-transform group-active:scale-90"
                aria-hidden
              />
            </button>
          ))}
        </div>
      )}

      {/* 3 cột: bàn (trái) · thực đơn (giữa) · đơn bàn (phải) */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-hairline-soft p-md lg:w-96">
          <TableMap
            areas={initial.areas}
            tables={initial.tables}
            sessions={initial.sessions}
            reservations={initial.reservations}
            selectedTableId={selectedTableId}
            onSelect={selectTable}
            takeawayActive={takeawayMode}
            onSelectTakeaway={enterTakeaway}
          />
        </aside>

        <section className="min-h-0 min-w-0 flex-1">
          <MenuPanel menu={menu} canAdd={takeawayMode || !!selectedTable} onAddLine={addLine} />
        </section>

        <aside className="w-[26rem] shrink-0 border-l border-hairline-soft lg:w-[30rem]">
          {takeawayMode ? (
            <TakeawayPanel
              slug={slug}
              cart={cart}
              itemMap={itemMap}
              orders={initial.takeawayOrders}
              onCartQty={cartQty}
              onCartRemove={cartRemove}
              onCartEdit={cartEdit}
              onClearCart={() => setCart([])}
              onClose={exitTakeaway}
            />
          ) : selectedTable ? (
            <OrderPanel
              slug={slug}
              table={selectedTable}
              session={selectedSession}
              cart={cart}
              itemMap={itemMap}
              onCartQty={cartQty}
              onCartRemove={cartRemove}
              onCartEdit={cartEdit}
              onConfirmAdd={confirmAdd}
              adding={adding}
              addError={addError}
              cancelStaff={cancelStaff}
              canCancelWithoutPin={canCancelWithoutPin}
              onOpenBill={openBill}
              openingBill={openingBill}
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

      {billOpen && (
        <BillPanel
          bills={bills}
          loading={openingBill}
          busy={billBusy}
          error={billError}
          mergeCandidates={mergeCandidates}
          allowDiscount={allowDiscount}
          adjustStaff={cancelStaff}
          canSkipPin={canCancelWithoutPin}
          onSplitByItems={doSplitByItems}
          onSplitByOrders={doSplitByOrders}
          onSplitEvenly={doSplitEvenly}
          onMerge={doMerge}
          onApplyDiscount={doApplyDiscount}
          onSetCharges={doSetCharges}
          onPay={doPay}
          onPrintReceipt={doPrintReceipt}
          onClose={() => setBillOpen(false)}
        />
      )}
    </div>
  );
}
