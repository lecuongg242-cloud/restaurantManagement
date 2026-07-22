"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "vaul";
import { Check } from "lucide-react";
import type { CustomerMenuItem } from "@/lib/orders/customer-menu";
import { formatVnd, unitPrice } from "@/lib/orders/cart";
import { QtyStepper } from "./QtyStepper";
import { cn } from "@/lib/utils";

/**
 * modifier-sheet (§5.2) — bottom sheet chọn tùy chọn món. Vaul lo drag/momentum/easing iOS.
 * Validate min/max/required Ở CLIENT trước khi thêm giỏ (server re-validate khi gửi order).
 * max_select===1 → radio; max_select>1 → checkbox (chặn vượt max). Option hết → disable.
 */
export type PendingLine = { itemId: string; qty: number; note: string; optionIds: string[] };

export function ModifierSheet({
  item,
  open,
  onOpenChange,
  onAdd,
}: {
  item: CustomerMenuItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (line: PendingLine) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  // Reset khi mở món mới.
  useEffect(() => {
    if (open && item) {
      // Nhóm radio bắt buộc: chọn sẵn option khả dụng đầu tiên cho UX mượt.
      const init: Record<string, string[]> = {};
      for (const g of item.groups) {
        if (g.max_select === 1 && (g.required || g.min_select >= 1)) {
          const firstAvail = g.options.find((o) => o.is_available);
          if (firstAvail) init[g.id] = [firstAvail.id];
        }
      }
      setSelected(init);
      setQty(1);
      setNote("");
    }
  }, [open, item]);

  const optionIds = useMemo(() => Object.values(selected).flat(), [selected]);

  // Validate: từng group thỏa min/max/required.
  const missingGroup = useMemo(() => {
    if (!item) return null;
    for (const g of item.groups) {
      const count = (selected[g.id] ?? []).length;
      const min = g.required ? Math.max(1, g.min_select) : g.min_select;
      if (count < min) return g.name;
    }
    return null;
  }, [item, selected]);

  if (!item) return null;

  const toggle = (groupId: string, optionId: string, max: number) => {
    setSelected((prev) => {
      const cur = prev[groupId] ?? [];
      if (max === 1) return { ...prev, [groupId]: cur[0] === optionId ? [] : [optionId] };
      if (cur.includes(optionId))
        return { ...prev, [groupId]: cur.filter((x) => x !== optionId) };
      if (cur.length >= max) return prev; // chặn vượt max
      return { ...prev, [groupId]: [...cur, optionId] };
    });
  };

  const total = unitPrice(item, optionIds) * qty;

  const handleAdd = () => {
    if (missingGroup) return;
    onAdd({ itemId: item.id, qty, note: note.trim(), optionIds });
    onOpenChange(false);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] max-w-md flex-col rounded-t-xl bg-canvas shadow-modal outline-none">
          <div className="mx-auto mt-sm h-1.5 w-10 shrink-0 rounded-full bg-hairline-strong" />

          {/* Nội dung cuộn */}
          <div className="min-h-0 flex-1 overflow-y-auto px-lg pb-md pt-sm">
            <Drawer.Title className="font-display text-xl text-ink">{item.name}</Drawer.Title>
            {item.description && (
              <p className="mt-xxs text-sm text-steel">{item.description}</p>
            )}

            {item.groups.map((g) => {
              const cur = selected[g.id] ?? [];
              return (
                <fieldset key={g.id} className="mt-lg">
                  <legend className="flex w-full items-center justify-between text-sm font-medium text-ink">
                    <span>{g.name}</span>
                    <span className="text-xs font-normal text-steel">
                      {g.required || g.min_select >= 1
                        ? "Bắt buộc"
                        : g.max_select > 1
                          ? `Chọn tối đa ${g.max_select}`
                          : "Tùy chọn"}
                    </span>
                  </legend>

                  <div className="mt-sm flex flex-col gap-xs">
                    {g.options.map((o) => {
                      const checked = cur.includes(o.id);
                      const atMax = g.max_select > 1 && cur.length >= g.max_select && !checked;
                      const disabled = !o.is_available || atMax;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggle(g.id, o.id, g.max_select)}
                          aria-pressed={checked}
                          className={cn(
                            "flex min-h-[44px] items-center justify-between rounded-md border px-md py-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                            checked
                              ? "border-primary bg-cream"
                              : "border-hairline hover:bg-surface",
                            disabled && "cursor-not-allowed opacity-45 hover:bg-transparent"
                          )}
                        >
                          <span className="flex items-center gap-sm">
                            <span
                              className={cn(
                                "grid h-5 w-5 shrink-0 place-items-center border",
                                g.max_select === 1 ? "rounded-full" : "rounded",
                                checked ? "border-primary bg-primary text-primary-fg" : "border-hairline-strong"
                              )}
                            >
                              {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                            </span>
                            <span className="text-sm text-ink">
                              {o.name}
                              {!o.is_available && (
                                <span className="ml-xs text-xs text-status-late">· Hết</span>
                              )}
                            </span>
                          </span>
                          {o.price_delta > 0 && (
                            <span className="text-sm text-steel">+{formatVnd(o.price_delta)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            {/* Ghi chú + số lượng */}
            <div className="mt-lg">
              <label htmlFor="modifier-note" className="text-sm font-medium text-ink">
                Ghi chú
              </label>
              <input
                id="modifier-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="VD: ít cay, không hành…"
                className="mt-xs h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="mt-lg flex items-center justify-between">
              <span className="text-sm text-steel">Số lượng</span>
              <QtyStepper value={qty} onChange={setQty} />
            </div>
          </div>

          {/* CTA cố định đáy */}
          <div className="shrink-0 border-t border-hairline-soft bg-canvas px-lg py-sm pb-[max(12px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!!missingGroup}
              className="flex h-12 w-full items-center justify-center gap-sm rounded-md bg-primary text-base font-medium text-primary-fg transition-colors hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
            >
              {missingGroup ? (
                <span>Vui lòng chọn &quot;{missingGroup}&quot;</span>
              ) : (
                <>
                  <span>Thêm vào giỏ</span>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{formatVnd(total)}</span>
                </>
              )}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
