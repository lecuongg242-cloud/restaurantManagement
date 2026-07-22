"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PosArea, PosTable, PosSession } from "@/lib/orders/pos";

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
  selectedTableId,
  onSelect,
}: {
  areas: PosArea[];
  tables: PosTable[];
  sessions: PosSession[];
  selectedTableId: string | null;
  onSelect: (id: string) => void;
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
              "rounded-full px-md py-xs text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              activeTab === t.id ? "bg-ink text-on-dark" : "bg-canvas text-steel hover:bg-cream"
            )}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="mt-lg grid grid-cols-2 gap-sm">
        {visible.map((t) => {
          const n = unservedByTable.get(t.id) ?? 0;
          const selected = t.id === selectedTableId;
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
              <span className="text-xs opacity-80">{STATUS_LABEL[t.status]}</span>
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
