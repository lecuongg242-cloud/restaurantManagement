"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Plus, Search, UtensilsCrossed } from "lucide-react";
import type { CustomerMenu, CustomerMenuItem } from "@/lib/orders/customer-menu";
import { formatVnd } from "@/lib/orders/cart";
import { ModifierSheet, type PendingLine } from "@/components/customer/ModifierSheet";
import { cn } from "@/lib/utils";

/**
 * MenuPanel (POS cột phải) — thực đơn luôn hiển thị + Ô TÌM KIẾM. Chạm bất kỳ món nào đều mở
 * ModifierSheet để nhập SL + GHI CHÚ (mọi món đều ghi chú được — yêu cầu chủ dự án); món có
 * tùy chọn thì chọn thêm. Chỉ thêm được khi đã chọn bàn (canAdd). Chỉ hiện món available.
 */

/** Bỏ dấu tiếng Việt để tìm kiếm không dấu ("com ga" khớp "Cơm gà"). */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

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
  const [query, setQuery] = useState("");

  const tap = (it: CustomerMenuItem) => {
    if (!canAdd || !it.is_available) return;
    // Luôn mở sheet để nhập SL + ghi chú (mọi món đều ghi chú được).
    setActiveItem(it);
    setModifierOpen(true);
  };

  // Lọc theo tìm kiếm (không dấu); ẩn danh mục rỗng.
  const filtered = useMemo(() => {
    if (!menu) return [];
    const q = norm(query.trim());
    return menu.categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((i) => i.is_available && (!q || norm(i.name).includes(q))),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menu, query]);

  const noResult = !!query.trim() && filtered.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-hairline-soft px-md py-sm">
        <div className="flex items-center justify-between gap-sm">
          <h2 className="font-display text-lg text-ink">Thực đơn</h2>
          {!canAdd && <span className="text-xs text-steel">Chọn bàn để thêm món</span>}
        </div>
        <div className="relative mt-sm">
          <Search className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm món…"
            aria-label="Tìm món"
            className="h-10 w-full rounded-md border border-hairline pl-8 pr-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-md py-sm">
        {!menu || menu.categories.length === 0 ? (
          <p className="py-xl text-center text-sm text-steel">Chưa có món.</p>
        ) : noResult ? (
          <p className="py-xl text-center text-sm text-steel">Không tìm thấy món.</p>
        ) : (
          filtered.map((cat) => (
            <section key={cat.id} className="mb-lg">
              <h3 className="sticky top-0 z-10 -mx-md mb-xs bg-canvas px-md py-xs font-display text-sm text-steel">
                {cat.name}
              </h3>
              <ul className="grid grid-cols-2 gap-sm md:grid-cols-3 xl:grid-cols-4">
                {cat.items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => tap(it)}
                      disabled={!canAdd}
                      aria-label={`Thêm ${it.name}`}
                      className={cn(
                        "group flex h-full min-h-[76px] w-full items-center gap-md rounded-lg border border-hairline-soft p-sm text-left shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        canAdd ? "hover:bg-cream active:bg-cream-deeper" : "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-xxs">
                        <span className="line-clamp-2 text-sm font-medium leading-snug text-ink [text-wrap:balance]">
                          {it.name}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-primary">
                          {formatVnd(it.base_price)}
                        </span>
                      </span>
                      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-hairline-soft bg-surface">
                        {it.image_url ? (
                          <Image src={it.image_url} alt="" fill sizes="64px" className="object-cover" />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-stone/70">
                            <UtensilsCrossed className="h-5 w-5" aria-hidden />
                          </span>
                        )}
                      </span>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg shadow-card transition-transform group-active:scale-95">
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <ModifierSheet
        item={activeItem}
        open={modifierOpen}
        onOpenChange={setModifierOpen}
        onAdd={onAddLine}
        presentation="dialog"
      />
    </div>
  );
}
