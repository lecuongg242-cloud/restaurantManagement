"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ShoppingBag } from "lucide-react";
import { createStaffOrderAction } from "@/app/r/[slug]/pos/actions";
import { ORDER_OFFLINE_MSG } from "@/components/pos/offline-msg";
import { stationSignOut } from "@/app/r/[slug]/station-actions";
import type { CustomerMenu, CustomerMenuItem } from "@/lib/orders/customer-menu";
import type { PosSnapshot } from "@/lib/orders/pos";
import type { CartLine } from "@/lib/orders/types";
import { formatVnd, unitPrice } from "@/lib/orders/cart";
import { cn } from "@/lib/utils";
import { CartSheet } from "@/components/customer/CartSheet";
import type { PendingLine } from "@/components/customer/ModifierSheet";
import { MenuPanel } from "./MenuPanel";

/**
 * Màn gọi món CẦM TAY (ORDER-15) — nhân viên cầm điện thoại tới bàn khách. POS quầy là bố cục
 * 3 cột cho tablet ngang (1024px+), không dùng được ở khổ dọc hẹp, nên đây là bề mặt riêng:
 * hai bước (chọn bàn → gõ món), một cột, nút to.
 *
 * Đơn gửi đi bằng `createStaffOrderAction` — CÙNG một hàm POS quầy dùng, nên vào thẳng
 * `confirmed` (không qua hàng chờ duyệt của khách QR) và gắn đúng phiên bàn để mọi lượt gọi
 * thêm gom về một bill. Điện thoại KHÔNG in: máy in nối với laptop quầy, quầy in theo banner
 * "Đơn cần in phiếu" (ORDER-16).
 */

const STATUS_VN: Record<string, string> = {
  available: "Trống",
  occupied: "Đang phục vụ",
  reserved: "Đã đặt",
  cleaning: "Dọn bàn",
};

export function StaffMobileOrder({
  slug,
  staffName,
  initial,
  menu,
  counter,
}: {
  slug: string;
  staffName: string;
  initial: PosSnapshot;
  menu: CustomerMenu | null;
  /** Quán chế độ quầy: không có bàn nào để chọn → màn này không có việc gì làm. */
  counter: boolean;
}) {
  const router = useRouter();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Xác nhận sau khi gửi — nhân viên cần một câu khẳng định trước khi rời bàn. */
  const [sent, setSent] = useState<{ tableName: string; count: number } | null>(null);

  const itemMap = useMemo(() => {
    const m = new Map<string, CustomerMenuItem>();
    for (const c of menu?.categories ?? []) for (const it of c.items) m.set(it.id, it);
    return m;
  }, [menu]);

  /** Số món đang có ở mỗi bàn — để nhân viên biết bàn nào đã gọi rồi ngay từ danh sách. */
  const qtyByTable = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of initial.sessions) {
      const n = s.orders
        .flatMap((o) => o.items)
        .filter((i) => i.status !== "cancelled")
        .reduce((sum, i) => sum + i.qty, 0);
      if (n > 0) m.set(s.tableId, n);
    }
    return m;
  }, [initial.sessions]);

  const selectedTable = initial.tables.find((t) => t.id === selectedTableId) ?? null;

  // Gộp dòng trùng (cùng món + cùng tùy chọn + cùng ghi chú) như POS quầy — chủ dự án đã chốt.
  const lineKey = (l: Pick<CartLine, "itemId" | "optionIds" | "note">) =>
    `${l.itemId}|${[...l.optionIds].sort().join(",")}|${l.note.trim()}`;

  const addLine = (line: PendingLine) =>
    setCart((prev) => {
      const k = lineKey(line);
      const idx = prev.findIndex((l) => lineKey(l) === k);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + line.qty };
        return next;
      }
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          itemId: line.itemId,
          qty: line.qty,
          note: line.note,
          optionIds: line.optionIds,
        },
      ];
    });

  const changeQty = (lineId: string, qty: number) =>
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l)));
  const changeNote = (lineId: string, note: string) =>
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, note } : l)));
  const removeLine = (lineId: string) => setCart((prev) => prev.filter((l) => l.lineId !== lineId));

  const cartCount = cart.reduce((n, l) => n + l.qty, 0);
  const cartTotal = cart.reduce((sum, l) => {
    const it = itemMap.get(l.itemId);
    return it ? sum + unitPrice(it, l.optionIds) * l.qty : sum;
  }, 0);

  const openTable = (id: string) => {
    setSelectedTableId(id);
    setCart([]);
    setOrderNote("");
    setErrorMsg(null);
    setSent(null);
  };

  const backToTables = () => {
    setSelectedTableId(null);
    setCart([]);
    setOrderNote("");
    setErrorMsg(null);
    setSent(null);
  };

  const submit = async () => {
    if (!selectedTableId || cart.length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    // Điện thoại của nhân viên đứng cạnh bàn là nơi sóng yếu nhất quán: mất mạng mà nút cứ quay,
    // giỏ hàng vẫn nguyên, thì đơn CHƯA sang bếp mà không ai biết — khách ngồi chờ món không tới.
    const res = await createStaffOrderAction(
      slug,
      selectedTableId,
      cart.map((l) => ({ itemId: l.itemId, qty: l.qty, note: l.note, optionIds: l.optionIds })),
      orderNote
    ).catch(() => null);
    setSubmitting(false);
    if (!res || !res.ok) {
      setErrorMsg(res ? res.error : ORDER_OFFLINE_MSG);
      return;
    }
    setSent({ tableName: selectedTable?.name ?? "—", count: cartCount });
    setCart([]);
    setOrderNote("");
    setCartOpen(false);
    router.refresh();
  };

  if (counter) {
    return (
      <main className="mx-auto max-w-md p-lg">
        <h1 className="mt-hero font-display text-2xl text-ink">Quán đang chạy chế độ quầy</h1>
        <p className="mt-md text-sm text-slate">
          Chế độ quầy không dùng sơ đồ bàn nên màn gọi món tại bàn không áp dụng. Gõ đơn cho khách
          ngay trên POS ở quầy.
        </p>
      </main>
    );
  }

  // ---- Bước 2: đã chọn bàn → thực đơn + giỏ ----
  if (selectedTable) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        <header className="flex shrink-0 items-center gap-sm border-b border-hairline-soft px-md py-sm">
          <button
            type="button"
            onClick={backToTables}
            aria-label="Quay lại danh sách bàn"
            className="-ml-xs grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-display text-lg text-ink">Bàn {selectedTable.name}</span>
            <span className="text-xs text-steel">
              {qtyByTable.get(selectedTable.id)
                ? `Đang có ${qtyByTable.get(selectedTable.id)} món`
                : "Chưa gọi món"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Mở giỏ${cartCount > 0 ? `, ${cartCount} món` : ""}`}
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-fg">
                {cartCount}
              </span>
            )}
          </button>
        </header>

        {/* Xác nhận đã gửi — ở lại đúng bàn để gọi thêm được ngay, kèm lối về danh sách bàn. */}
        {sent && (
          <div className="flex shrink-0 flex-wrap items-center gap-sm border-b border-status-ready/30 bg-status-ready-bg px-md py-sm">
            <span className="inline-flex items-center gap-xs text-sm font-semibold text-ink">
              <Check className="h-4 w-4 text-status-ready" aria-hidden />
              Đã gửi về quầy · Bàn {sent.tableName} · {sent.count} món
            </span>
            <button
              type="button"
              onClick={backToTables}
              className="ml-auto inline-flex min-h-[44px] items-center rounded-md px-md text-sm font-semibold text-primary hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Chọn bàn khác
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <MenuPanel
            slug={slug}
            menu={menu}
            canAdd
            onAddLine={addLine}
            modifierPresentation="sheet"
          />
        </div>

        {cartCount > 0 && !cartOpen && (
          <div className="shrink-0 border-t border-hairline-soft bg-canvas px-md py-sm pb-[max(8px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex h-12 w-full items-center justify-between rounded-full bg-primary px-lg text-primary-fg shadow-card transition-colors hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span className="flex items-center gap-sm text-sm font-medium">
                <ShoppingBag className="h-4 w-4" />
                Xem giỏ · {cartCount} món
              </span>
              <span className="tabular-nums text-sm font-semibold">{formatVnd(cartTotal)}</span>
            </button>
          </div>
        )}

        <CartSheet
          open={cartOpen}
          onOpenChange={setCartOpen}
          lines={cart}
          itemMap={itemMap}
          orderNote={orderNote}
          onOrderNoteChange={setOrderNote}
          customerName=""
          onCustomerNameChange={() => {}}
          customerPhone=""
          onCustomerPhoneChange={() => {}}
          onChangeQty={changeQty}
          onChangeNote={changeNote}
          onRemove={removeLine}
          onSubmit={submit}
          submitting={submitting}
          errorMsg={errorMsg}
          staff
          title={`Bàn ${selectedTable.name}`}
        />
      </div>
    );
  }

  // ---- Bước 1: chọn bàn ----
  const areas = [
    ...initial.areas.map((a) => ({ id: a.id, name: a.name })),
    { id: "__none__", name: "Chưa xếp khu" },
  ].filter((a) => initial.tables.some((t) => (t.area_id ?? "__none__") === a.id));

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex shrink-0 items-center gap-sm border-b border-hairline-soft bg-canvas px-md py-sm">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="font-display text-lg text-ink">Gọi món tại bàn</span>
          <span className="truncate text-xs text-steel">{staffName}</span>
        </div>
        <form action={stationSignOut.bind(null, slug, "pos")}>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center rounded-md px-md text-sm font-medium text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Đăng xuất
          </button>
        </form>
      </header>

      {sent && (
        <div className="flex shrink-0 items-center gap-xs border-b border-status-ready/30 bg-status-ready-bg px-md py-sm text-sm font-semibold text-ink">
          <Check className="h-4 w-4 text-status-ready" aria-hidden />
          Đã gửi về quầy · Bàn {sent.tableName} · {sent.count} món
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto p-md">
        {initial.tables.length === 0 ? (
          <p className="py-xl text-center text-sm text-steel">
            Chưa có bàn nào. Thêm bàn ở khu quản trị trước.
          </p>
        ) : (
          areas.map((area) => (
            <section key={area.id} className="mb-lg">
              <h2 className="mb-xs font-display text-sm text-steel">{area.name}</h2>
              <ul className="grid grid-cols-2 gap-sm sm:grid-cols-3">
                {initial.tables
                  .filter((t) => (t.area_id ?? "__none__") === area.id)
                  .map((t) => {
                    const qty = qtyByTable.get(t.id) ?? 0;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => openTable(t.id)}
                          className={cn(
                            "flex min-h-[88px] w-full flex-col justify-between rounded-lg border bg-canvas p-sm text-left shadow-card transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                            qty > 0 ? "border-primary/50" : "border-hairline-soft"
                          )}
                        >
                          <span className="font-display text-xl text-ink">{t.name}</span>
                          <span className="flex items-baseline justify-between gap-xs">
                            <span className="text-xs text-steel">{STATUS_VN[t.status]}</span>
                            {qty > 0 && (
                              <span className="text-xs font-semibold tabular-nums text-primary">
                                {qty} món
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
