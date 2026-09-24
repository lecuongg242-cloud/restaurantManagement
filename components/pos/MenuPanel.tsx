"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Ban, Plus, Search, UtensilsCrossed } from "lucide-react";
import type { CustomerMenu, CustomerMenuItem } from "@/lib/orders/customer-menu";
import { formatVnd } from "@/lib/orders/cart";
import { normalizeVi as norm } from "@/lib/menu/search";
import { ModifierSheet, type PendingLine } from "@/components/customer/ModifierSheet";
import { AvailabilityToggle } from "@/components/menu/AvailabilityToggle";
import { cn } from "@/lib/utils";
import { PortionBadge } from "./PortionBadge";

/**
 * MenuPanel (POS cột phải) — thực đơn luôn hiển thị + Ô TÌM KIẾM. Chạm một món: có tùy chọn thì
 * mở ModifierSheet để chọn; KHÔNG có tùy chọn thì vào thẳng giỏ. Số lượng và ghi chú sửa ngay ở
 * giỏ nên không cần hộp thoại trung gian. Chỉ thêm được khi đã chọn bàn (canAdd).
 *
 * MENU-04: món HẾT vẫn hiện (mờ, không thêm được) kèm switch Còn/Hết để nhân viên báo hết ngay
 * tại POS — không phải vào khu quản trị (QD-010 §5).
 */

export function MenuPanel({
  slug,
  menu,
  canAdd,
  onAddLine,
  emptyHint = "Chọn bàn để thêm món",
  modifierPresentation = "dialog",
  portions,
}: {
  slug: string;
  menu: CustomerMenu | null;
  canAdd: boolean;
  onAddLine: (line: PendingLine) => void;
  /** Chữ nhắc khi chưa thêm được — POS quầy nhắc chọn bàn, màn điện thoại có ngữ cảnh khác. */
  emptyHint?: string;
  /** Điện thoại (ORDER-15) dùng bottom sheet; POS quầy màn rộng dùng dialog giữa màn hình. */
  modifierPresentation?: "dialog" | "sheet";
  /** Số phần ước tính theo id món/tùy chọn (INV-07). Chỉ để hiện nhãn — KHÔNG ảnh hưởng `addable`. */
  portions?: Record<string, number>;
}) {
  const [activeItem, setActiveItem] = useState<CustomerMenuItem | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [query, setQuery] = useState("");

  const tap = (it: CustomerMenuItem) => {
    if (!canAdd || !it.is_available) return;
    if (it.groups.length === 0) {
      // Món không có tùy chọn → THÊM THẲNG vào giỏ. Ghi chú và số lượng đều sửa được ngay tại
      // giỏ, nên mở hộp thoại chỉ để bấm thêm một nút nữa là thừa một nhịp cho mỗi món.
      onAddLine({ itemId: it.id, qty: 1, note: "", optionIds: [] });
      return;
    }
    setActiveItem(it);
    setModifierOpen(true);
  };

  // Lọc theo tìm kiếm (không dấu); ẩn danh mục rỗng.
  // Món HẾT vẫn hiện (mờ + nhãn "Hết") để nhân viên bật lại được — MENU-04. `getCustomerMenu`
  // vốn trả cả món is_available=false nên chỉ cần bỏ lọc, không đụng query.
  const filtered = useMemo(() => {
    if (!menu) return [];
    const q = norm(query.trim());
    return menu.categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((i) => !q || norm(i.name).includes(q)),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menu, query]);

  const noResult = !!query.trim() && filtered.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-hairline-soft px-md py-sm">
        <div className="flex items-center justify-between gap-sm">
          <h2 className="font-display text-lg text-ink">Thực đơn</h2>
          {!canAdd && <span className="text-xs text-steel">{emptyHint}</span>}
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
              {/* auto-fill theo bề ngang THẬT của cột menu, không theo bề ngang cửa sổ: breakpoint
                  md/xl đo viewport nên màn rộng vẫn ép 4 cột vào cột hẹp → thẻ ~130px, tên món bị
                  bóp về 0 và nút tròn bị cắt. Mỗi thẻ cần ≥160px cho ảnh+nút+padding. */}
              <ul className="grid gap-sm grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
                {cat.items.map((it) => {
                  const addable = canAdd && it.is_available;
                  return (
                    // Toggle là ANH EM của nút thêm món, không lồng trong nó: nút trong nút là
                    // HTML không hợp lệ và bấm "Hết" sẽ nổi bọt lên mở ModifierSheet.
                    <li
                      key={it.id}
                      className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline-soft shadow-card"
                    >
                      <button
                        type="button"
                        onClick={() => tap(it)}
                        disabled={!addable}
                        aria-label={
                          it.is_available ? `Thêm ${it.name}` : `${it.name} — hết món`
                        }
                        className={cn(
                          "group flex min-h-[76px] flex-1 items-center gap-md p-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                          addable
                            ? "hover:bg-cream active:bg-cream-deeper"
                            : "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-xxs">
                          <span className="line-clamp-2 text-sm font-medium leading-snug text-ink [text-wrap:balance]">
                            {it.name}
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-primary">
                            {formatVnd(it.base_price)}
                          </span>
                          <PortionBadge portions={portions?.[it.id]} />
                        </span>
                        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-hairline-soft bg-surface">
                          {/* sizes = 2× bề rộng ô (xem admin/menu/page.tsx): tránh ảnh ngang
                              bị phóng to khi object-cover crop theo chiều cao. */}
                          {it.image_url ? (
                            <Image src={it.image_url} alt="" fill sizes="128px" className="object-cover" />
                          ) : (
                            <span className="grid h-full w-full place-items-center text-stone/70">
                              <UtensilsCrossed className="h-5 w-5" aria-hidden />
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-card transition-transform group-active:scale-95",
                            it.is_available
                              ? "bg-primary text-primary-fg"
                              : "bg-hairline-strong text-canvas"
                          )}
                        >
                          {it.is_available ? (
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          ) : (
                            <Ban className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                          )}
                        </span>
                      </button>

                      <div className="flex items-center justify-between gap-xs border-t border-hairline-soft bg-surface px-sm">
                        <span className="text-xs text-steel">Còn/Hết</span>
                        <AvailabilityToggle
                          slug={slug}
                          itemId={it.id}
                          available={it.is_available}
                          className="min-h-11"
                        />
                      </div>
                    </li>
                  );
                })}
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
        presentation={modifierPresentation}
        portions={portions}
      />
    </div>
  );
}
