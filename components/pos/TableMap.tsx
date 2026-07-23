"use client";

import { useState } from "react";
import { CalendarClock, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PosArea, PosTable, PosSession, PosReservation } from "@/lib/orders/pos";

/**
 * TableMap (§4.2, §2.2) — tab khu vực + lưới table-tile màu theo status. Tile hiện tên bàn +
 * số món chưa phục vụ trong phiên. Touch ≥44px. Màu: available viền / occupied cream /
 * reserved viền primary / cleaning xám.
 */
const STATUS_CLASS: Record<PosTable["status"], string> = {
  available: "border-hairline bg-canvas text-ink",
  occupied: "border-beige-deep bg-cream text-ink",
  reserved: "border-primary bg-canvas text-ink",
  cleaning: "border-hairline bg-surface text-muted",
};

const STATUS_LABEL: Record<PosTable["status"], string> = {
  available: "Trống",
  occupied: "Đang phục vụ",
  reserved: "Đã đặt",
  cleaning: "Dọn bàn",
};

export function TableMap({
  areas,
  tables,
  sessions,
  reservations = [],
  selectedTableId,
  onSelect,
  takeawayActive = false,
  onSelectTakeaway,
}: {
  areas: PosArea[];
  tables: PosTable[];
  sessions: PosSession[];
  reservations?: PosReservation[];
  selectedTableId: string | null;
  onSelect: (id: string) => void;
  takeawayActive?: boolean;
  onSelectTakeaway?: () => void;
}) {
  const tabs = [{ id: "all", name: "Tất cả" }, ...areas, { id: "none", name: "Chưa xếp khu" }];
  const [activeTab, setActiveTab] = useState("all");

  // Số món chưa phục vụ theo bàn (từ phiên mở).
  const unservedByTable = new Map<string, number>();
  for (const s of sessions) {
    let n = 0;
    for (const o of s.orders)
      for (const it of o.items) if (it.status !== "served" && it.status !== "cancelled") n++;
    unservedByTable.set(s.tableId, n);
  }

  // Đặt bàn hôm nay theo bàn (đã sort theo giờ). Thẻ hiện lịch sắp tới gần nhất.
  const reservationsByTable = new Map<string, PosReservation[]>();
  for (const r of reservations) {
    const arr = reservationsByTable.get(r.tableId) ?? [];
    arr.push(r);
    reservationsByTable.set(r.tableId, arr);
  }
  const graceMs = Date.now() - 30 * 60000; // còn hiện tới 30' sau giờ đặt (khách có thể tới trễ)
  const pickReservation = (tableId: string) => {
    const arr = reservationsByTable.get(tableId);
    if (!arr || arr.length === 0) return null;
    const upcoming = arr.filter((r) => new Date(r.reservedAt).getTime() >= graceMs);
    const list = upcoming.length > 0 ? upcoming : arr;
    return { next: list[0], more: list.length - 1 };
  };

  const visible = tables.filter((t) => {
    if (activeTab === "all") return true;
    if (activeTab === "none") return t.area_id === null;
    return t.area_id === activeTab;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-xs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            aria-pressed={activeTab === t.id}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-full px-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              activeTab === t.id ? "bg-ink text-on-dark" : "bg-canvas text-steel hover:bg-cream"
            )}
          >
            {t.name}
          </button>
        ))}
      </div>

      {onSelectTakeaway && (
        <button
          type="button"
          onClick={onSelectTakeaway}
          aria-pressed={takeawayActive}
          className={cn(
            "mt-lg flex w-full items-center gap-sm rounded-lg border-2 border-dashed px-md py-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            takeawayActive
              ? "border-primary bg-cream-soft text-ink ring-2 ring-primary ring-offset-2"
              : "border-hairline-strong bg-canvas text-ink hover:bg-surface"
          )}
        >
          <ShoppingBag className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Bán mang về</span>
          <span className="ml-auto text-xs text-steel">không gắn bàn</span>
        </button>
      )}

      <div className={cn("grid grid-cols-2 gap-sm", onSelectTakeaway ? "mt-sm" : "mt-lg")}>
        {visible.map((t) => {
          const n = unservedByTable.get(t.id) ?? 0;
          const selected = t.id === selectedTableId;
          const resv = pickReservation(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={selected}
              className={cn(
                "flex min-h-[88px] flex-col items-start justify-between rounded-lg border-2 p-md text-left transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                STATUS_CLASS[t.status],
                selected && "ring-2 ring-primary ring-offset-2"
              )}
            >
              <div className="flex w-full items-start justify-between">
                <span className="text-lg font-semibold">{t.name}</span>
                {n > 0 && (
                  <span className="grid h-6 min-w-[24px] place-items-center rounded-full bg-primary px-1 text-xs font-bold text-primary-fg">
                    {n}
                  </span>
                )}
              </div>
              <div className="flex w-full flex-col items-start gap-xxs">
                <span className="text-xs opacity-80">{STATUS_LABEL[t.status]}</span>
                {resv && (
                  <span className="inline-flex max-w-full items-center gap-xxs text-[11px] font-medium text-primary">
                    <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">
                      {resv.next.timeLabel} · {resv.next.customerName} · {resv.next.partySize} người
                      {resv.more > 0 ? ` +${resv.more}` : ""}
                    </span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full py-xl text-center text-sm text-steel">Không có bàn.</p>
        )}
      </div>
    </div>
  );
}
