"use client";

import { useMemo, useState } from "react";
import { Drawer } from "vaul";
import { Search, X } from "lucide-react";
import type { CustomerMenu } from "@/lib/orders/customer-menu";
import { normalizeVi } from "@/lib/menu/search";
import { AvailabilityToggle } from "@/components/menu/AvailabilityToggle";
import { cn } from "@/lib/utils";

/**
 * Drawer "Báo hết món" ở KDS (MENU-04 · QD-010 §5).
 *
 * Bếp là người biết hết món đầu tiên, nhưng vai trò `kitchen` KHÔNG vào được `/pos`
 * (`canAccess`) lẫn `/admin` — không có màn này thì đúng người cần nhất lại không báo được.
 * Bảng vé vẫn CHỈ ĐỂ XEM (QĐ 22/07): quy tắc "bếp không chạm" nói về trạng thái VÉ, không phải
 * tình trạng còn/hết của thực đơn.
 *
 * Mở từ phải (direction="right") để không đè lên luồng đọc vé xếp dọc.
 */
export function SoldOutDrawer({
  slug,
  menu,
  open,
  onOpenChange,
}: {
  slug: string;
  menu: CustomerMenu | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");

  // Danh sách PHẲNG (không nhóm danh mục): bếp tìm theo tên món, không duyệt cây.
  const items = useMemo(() => {
    if (!menu) return [];
    const q = normalizeVi(query.trim());
    return menu.categories
      .flatMap((cat) => cat.items.map((it) => ({ ...it, categoryName: cat.name })))
      .filter((it) => !q || normalizeVi(it.name).includes(q));
  }, [menu, query]);

  const soldOutCount = useMemo(
    () => (menu?.categories ?? []).flatMap((c) => c.items).filter((i) => !i.is_available).length,
    [menu]
  );

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="right" repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-canvas shadow-modal outline-none">
          <header className="flex shrink-0 items-start justify-between gap-sm border-b border-hairline px-lg py-md">
            <div>
              <Drawer.Title className="font-semibold text-xl text-ink">Báo hết món</Drawer.Title>
              <Drawer.Description className="mt-xxs text-sm text-steel">
                Tắt món khi bếp hết nguyên liệu — khách và POS không đặt được nữa.
                {soldOutCount > 0 && (
                  <span className="text-status-late"> Đang hết: {soldOutCount} món.</span>
                )}
              </Drawer.Description>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Đóng"
              style={{ touchAction: "manipulation" }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div className="shrink-0 border-b border-hairline-soft px-lg py-sm">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-stone"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm món…"
                aria-label="Tìm món"
                className="h-11 w-full rounded-md border border-hairline pl-8 pr-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-lg py-sm">
            {items.length === 0 ? (
              <p className="py-xl text-center text-sm text-steel">
                {menu ? "Không tìm thấy món." : "Chưa có thực đơn."}
              </p>
            ) : (
              <ul className="flex flex-col gap-xxs">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className={cn(
                      "flex min-h-[56px] items-center justify-between gap-md rounded-md border border-hairline-soft px-md py-xs",
                      !it.is_available && "bg-surface"
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span
                        className={cn(
                          "truncate text-sm font-medium text-ink",
                          !it.is_available && "line-through opacity-60"
                        )}
                      >
                        {it.name}
                      </span>
                      <span className="truncate text-xs text-steel">{it.categoryName}</span>
                    </span>
                    <AvailabilityToggle
                      slug={slug}
                      itemId={it.id}
                      available={it.is_available}
                      className="min-h-11 shrink-0 px-sm"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
