"use client";

import { useEffect, useState } from "react";
import { Banknote, BellRing, CalendarClock, Clock, ConciergeBell, Hand, Link2, Printer, ShoppingBag } from "lucide-react";
import { formatVnd } from "@/lib/orders/cart";
import { thoiGianNgoi } from "@/lib/time/vn";
import { cn } from "@/lib/utils";
import { ScrollRow } from "@/components/ui/scroll-row";
import type { PosArea, PosTable, PosSession, PosReservation } from "@/lib/orders/pos";
import { matchesTableFilter, needsAttention, type TableFilter, type TableFlags } from "@/lib/orders/table-flags";

/**
 * TableMap (§4.2, §2.2) — tab khu vực + lưới table-tile màu theo status. Tile hiện tên bàn + TẠM TÍNH + thời gian
 * khách ngồi (như Sapo / CUKCUK; chủ dự án chốt 01/10/2026 — thay chấm đỏ đếm món). Touch ≥44px. Màu: available viền / occupied cream /
 * reserved viền primary / cleaning xám.
 *
 * P27: tab khu MỘT hàng cuộn ngang (ORDER-22); hàng lọc "Tất cả · Đang phục vụ · Trống · Cần xử lý" kèm số; thẻ bàn có dấu
 * chờ duyệt / chưa in / gọi / món xong chờ mang ra, thẻ cần xử lý viền đỏ (ORDER-24 — như KiotViet chuông trên ô bàn).
 */
const FILTERS: { id: TableFilter; name: string }[] = [
  { id: "all", name: "Tất cả" },
  { id: "busy", name: "Đang phục vụ" },
  { id: "free", name: "Trống" },
  { id: "attention", name: "Cần xử lý" },
  { id: "pay", name: "Chờ thanh toán" },
];
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
  takeawayCount = 0,
  onSelectTakeaway,
  flags,
}: {
  areas: PosArea[];
  tables: PosTable[];
  sessions: PosSession[];
  reservations?: PosReservation[];
  selectedTableId: string | null;
  onSelect: (id: string) => void;
  takeawayActive?: boolean;
  takeawayCount?: number;
  onSelectTakeaway?: () => void;
  /** Dấu "cần xử lý" theo bàn (lib/orders/table-flags). Không truyền = không dấu, không hàng lọc. */
  flags?: Map<string, TableFlags>;
}) {
  const tabs = [{ id: "all", name: "Tất cả" }, ...areas, { id: "none", name: "Chưa xếp khu" }];
  const [activeTab, setActiveTab] = useState("all");
  const [filter, setFilter] = useState<TableFilter>("all");

  // Đồng hồ cho "thời gian ngồi" — nhịp 30 giây là đủ cho số phút.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Phiên mở theo BÀN CHÍNH: tạm tính (cùng cách tính với "Tạm tính" của panel bàn) + giờ mở. Nhóm bàn (P23):
  // tiền cả nhóm chỉ hiện ở bàn chính — bàn phụ chỉ ghi "Nhóm B1", tránh nhìn như cộng trùng.
  const sessionByMain = new Map<string, { total: number; openedAt: string }>();
  for (const s of sessions) {
    let total = 0;
    for (const o of s.orders)
      for (const it of o.items) if (it.status !== "cancelled") total += it.unit_price * it.qty;
    sessionByMain.set(s.tableId, { total, openedAt: s.opened_at });
  }

  // Nhãn nhóm (P23): bàn phụ "Nhóm B1"; bàn chính "Nhóm B1 · 5 bàn".
  const groupLabelByTable = new Map<string, string>();
  for (const s of sessions) {
    if (s.memberTableIds.length === 0) continue;
    const mainName = tables.find((t) => t.id === s.tableId)?.name ?? "?";
    groupLabelByTable.set(s.tableId, `Nhóm ${mainName} · ${s.memberTableIds.length + 1} bàn`);
    for (const id of s.memberTableIds) groupLabelByTable.set(id, `Nhóm ${mainName}`);
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

  const inArea = tables.filter((t) => {
    if (activeTab === "all") return true;
    if (activeTab === "none") return t.area_id === null;
    return t.area_id === activeTab;
  });
  const visible = inArea.filter((t) => matchesTableFilter(t, flags?.get(t.id), filter));
  const countOf = (f: TableFilter) => inArea.filter((t) => matchesTableFilter(t, flags?.get(t.id), f)).length;
  const chip =
    "inline-flex min-h-[44px] shrink-0 items-center gap-xxs whitespace-nowrap rounded-full px-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

  return (
    <div>
      {/* Một hàng cuộn ngang — 5–6 khu không gấp thành nhiều hàng ăn chỗ của sơ đồ bàn. */}
      <ScrollRow role="group" aria-label="Khu vực" className="-mx-md gap-xs px-md">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            aria-pressed={activeTab === t.id}
            className={cn(chip, activeTab === t.id ? "bg-cream-deeper text-primary-deep ring-1 ring-inset ring-primary/50" : "bg-canvas text-steel hover:bg-cream")}
          >
            {t.name}
          </button>
        ))}
      </ScrollRow>

      {flags && (
        <ScrollRow role="group" aria-label="Lọc trạng thái bàn" className="-mx-md mt-xs gap-xs px-md">
          {FILTERS.map((f) => {
            const n = countOf(f.id);
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={on}
                className={cn(
                  chip,
                  "min-h-9 border text-[13px]",
                  on
                    ? f.id === "attention"
                      ? "border-status-late bg-status-late text-status-late-fg"
                      : "border-primary bg-cream text-primary-deep"
                    : f.id === "attention" && n > 0
                      ? "border-status-late/50 bg-canvas text-status-late"
                      : f.id === "pay" && n > 0
                        ? "border-status-ready/60 bg-canvas text-status-ready"
                        : "border-hairline bg-canvas text-steel hover:bg-cream"
                )}
              >
                {f.name}
                <span className="tabular-nums opacity-80">{n}</span>
              </button>
            );
          })}
        </ScrollRow>
      )}

      {onSelectTakeaway && (
        <button
          type="button"
          onClick={onSelectTakeaway}
          aria-pressed={takeawayActive}
          aria-label={`Khách không bàn${takeawayCount > 0 ? `, ${takeawayCount} đơn đang chờ` : ""}`}
          className={cn(
            "mt-lg flex w-full items-center gap-sm rounded-lg border-2 border-dashed px-md py-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            takeawayActive
              ? "border-primary bg-cream-soft text-ink ring-2 ring-primary ring-offset-2"
              : "border-hairline-strong bg-canvas text-ink hover:bg-surface"
          )}
        >
          <ShoppingBag className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Khách không bàn</span>
          <span className="ml-auto flex items-center gap-sm">
            {takeawayCount > 0 && (
              <span className="grid h-6 min-w-[24px] place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-fg">
                {takeawayCount}
              </span>
            )}
            <span className="text-xs text-steel">{takeawayCount > 0 ? "đơn chờ" : "Tại quán · Mang về"}</span>
          </span>
        </button>
      )}

      <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-sm", onSelectTakeaway ? "mt-sm" : "mt-lg")}>
        {visible.map((t) => {
          const phien = sessionByMain.get(t.id);
          const selected = t.id === selectedTableId;
          const resv = pickReservation(t.id);
          const groupLabel = groupLabelByTable.get(t.id);
          const f = flags?.get(t.id);
          const canXuLy = needsAttention(f);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={selected}
              className={cn(
                "flex min-h-[88px] flex-col items-start justify-between rounded-lg border-2 p-md text-left transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                STATUS_CLASS[t.status],
                canXuLy && "border-status-late",
                selected && "ring-2 ring-primary ring-offset-2"
              )}
            >
              <div className="flex w-full items-start justify-between gap-xs">
                <span className="min-w-0 truncate text-lg font-semibold">{t.name}</span>
                {phien && phien.total > 0 && (
                  <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-ink">
                    {formatVnd(phien.total)}
                  </span>
                )}
              </div>
              <div className="flex w-full flex-col items-start gap-xxs">
                <span className="text-xs opacity-80">{STATUS_LABEL[t.status]}</span>
                {phien && (
                  <span data-thoi-gian className="inline-flex items-center gap-xxs text-[11px] font-medium tabular-nums opacity-80">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden />
                    <span suppressHydrationWarning>{thoiGianNgoi(phien.openedAt, now)}</span>
                  </span>
                )}
                {groupLabel && (
                  <span className="inline-flex max-w-full items-center gap-xxs text-[11px] font-medium text-ink">
                    <Link2 className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{groupLabel}</span>
                  </span>
                )}
                {f && canXuLy && (
                  <span className="flex flex-wrap items-center gap-xxs" data-dau-ban>
                    {f.pending > 0 && (
                      <Dau cls="bg-primary text-primary-fg" title={`${f.pending} đơn chờ duyệt`}>
                        <BellRing className="h-3 w-3" aria-hidden />
                        {f.pending}
                      </Dau>
                    )}
                    {f.unprinted > 0 && (
                      <Dau cls="bg-status-late text-status-late-fg" title={`${f.unprinted} đơn chưa in phiếu bếp`}>
                        <Printer className="h-3 w-3" aria-hidden />
                        {f.unprinted}
                      </Dau>
                    )}
                    {f.calls > 0 && (
                      <Dau cls="bg-cream-deeper text-ink" title="Đang gọi nhân viên">
                        <Hand className="h-3 w-3" aria-hidden />
                        {f.calls}
                      </Dau>
                    )}
                    {f.payment > 0 && (
                      <Dau cls="bg-status-ready-bg text-status-ready ring-1 ring-status-ready" title="Chờ thanh toán">
                        <Banknote className="h-3 w-3" aria-hidden />
                        TT
                      </Dau>
                    )}
                    {f.ready > 0 && (
                      <Dau cls="bg-status-ready text-canvas" title={`${f.ready} món bếp đã xong, chờ mang ra`}>
                        <ConciergeBell className="h-3 w-3" aria-hidden />
                        {f.ready}
                      </Dau>
                    )}
                  </span>
                )}
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

/** Dấu nhỏ có số trên thẻ bàn; chữ đầy đủ ở title + aria-label cho trình đọc màn hình. */
function Dau({ cls, title, children }: { cls: string; title: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      aria-label={title}
      className={cn("inline-flex items-center gap-[2px] rounded px-1 py-px text-[11px] font-bold tabular-nums", cls)}
    >
      {children}
    </span>
  );
}
