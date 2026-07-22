"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { CustomerMenu, CustomerMenuItem } from "@/lib/orders/customer-menu";
import { formatVnd } from "@/lib/orders/cart";
import { ModifierSheet, type PendingLine } from "@/components/customer/ModifierSheet";
import { cn } from "@/lib/utils";

/**
 * MenuPanel (POS cột phải) — thực đơn luôn hiển thị; chạm món để thêm vào giỏ "đang thêm" của bàn.
 * Món có tùy chọn → mở ModifierSheet (tái dùng từ luồng khách); không tùy chọn → thêm thẳng.
 * Chỉ thêm được khi đã chọn bàn (canAdd). Chỉ hiện món available.
 */
export function MenuPanel({
  menu,
  canAdd,
  onAddLine,
}: {
  menu: CustomerMenu | null;
  canAdd: boolean;
  onAddLine: (line: PendingLine) => void;
}) {
  const [activeItem, setActiveItem] = useState<CustomerMenuItem | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);

  const tap = (it: CustomerMenuItem) => {
    if (!canAdd || !it.is_available) return;
    if (it.groups.length > 0) {
      setActiveItem(it);
      setModifierOpen(true);
    } else {
      onAddLine({ itemId: it.id, qty: 1, note: "", optionIds: [] });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-hairline-soft px-md py-sm">
        <h2 className="font-display text-lg text-ink">Thực đơn</h2>
        {!canAdd && <p className="text-xs text-steel">Chọn bàn để thêm món</p>}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-md py-sm">
        {!menu || menu.categories.length === 0 ? (
          <p className="py-xl text-center text-sm text-steel">Chưa có món.</p>
        ) : (
          menu.categories.map((cat) => {
            const avail = cat.items.filter((i) => i.is_available);
            if (avail.length === 0) return null;
            return (
              <section key={cat.id} className="mb-lg">
                <h3 className="sticky top-0 z-10 -mx-md mb-xs bg-canvas px-md py-xs font-display text-sm text-steel">
                  {cat.name}
                </h3>
                <ul className="grid grid-cols-2 gap-sm md:grid-cols-3 xl:grid-cols-4">
                  {avail.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => tap(it)}
                        disabled={!canAdd}
                        aria-label={`Thêm ${it.name}`}
                        className={cn(
                          "flex h-full min-h-[72px] w-full flex-col justify-between gap-sm rounded-lg border border-hairline-soft p-md text-left shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                          canAdd ? "hover:bg-cream active:bg-cream-deeper" : "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span className="line-clamp-2 text-sm font-medium leading-snug text-ink [text-wrap:balance]">
                          {it.name}
                        </span>
                        <span className="flex items-center justify-between">
                          <span className="text-sm font-semibold tabular-nums text-primary">
                            {formatVnd(it.base_price)}
                          </span>
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      <ModifierSheet
        item={activeItem}
        open={modifierOpen}
        onOpenChange={setModifierOpen}
        onAdd={onAddLine}
      />
    </div>
  );
}
