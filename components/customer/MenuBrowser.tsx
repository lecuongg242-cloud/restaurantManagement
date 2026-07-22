"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plus, ShoppingBag } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { CustomerMenu, CustomerMenuItem } from "@/lib/orders/customer-menu";
import type { CartLine } from "@/lib/orders/types";
import { formatVnd } from "@/lib/orders/cart";
import { cn } from "@/lib/utils";
import { ModifierSheet, type PendingLine } from "./ModifierSheet";
import { CartSheet } from "./CartSheet";

/**
 * MenuBrowser (§4.1) — điều phối luồng khách gọi món. Giỏ là state client + sessionStorage
 * theo qr_token (không ghi DB tới khi "Gửi order"). Chip danh mục scroll-snap + scroll-spy;
 * thẻ món stagger reveal. Tôn trọng prefers-reduced-motion (MotionConfig reducedMotion="user").
 */
export function MenuBrowser({
  slug,
  menu,
  qrToken,
  canOrder,
  tableName,
}: {
  slug: string;
  menu: CustomerMenu;
  qrToken: string | null;
  canOrder: boolean;
  tableName: string | null;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeItem, setActiveItem] = useState<CustomerMenuItem | null>(null);
  const [modifierOpen, setModifierOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState(menu.categories[0]?.id ?? "");
  const [badgePulse, setBadgePulse] = useState(0);

  const storageKey = qrToken ? `cart:${slug}:${qrToken}` : null;

  const itemMap = useMemo(() => {
    const m = new Map<string, CustomerMenuItem>();
    for (const c of menu.categories) for (const it of c.items) m.set(it.id, it);
    return m;
  }, [menu]);

  // Nạp giỏ từ sessionStorage.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setCart(JSON.parse(raw));
    } catch {
      /* bỏ qua giỏ hỏng */
    }
  }, [storageKey]);

  // Lưu giỏ khi đổi.
  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      /* quota */
    }
  }, [cart, storageKey]);

  // Scroll-spy: chip danh mục nào đang trong khung nhìn.
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target) setActiveCat(visible.target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: [0, 0.25, 0.5] }
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [menu]);

  const cartCount = cart.reduce((n, l) => n + l.qty, 0);

  const pulseBadge = () => setBadgePulse((n) => n + 1);

  const addLine = (line: PendingLine) => {
    const newLine: CartLine = {
      lineId: crypto.randomUUID(),
      itemId: line.itemId,
      qty: line.qty,
      note: line.note,
      optionIds: line.optionIds,
    };
    setCart((prev) => [...prev, newLine]);
    pulseBadge();
  };

  const handleItemTap = (item: CustomerMenuItem) => {
    if (!canOrder || !item.is_available) return;
    if (item.groups.length > 0) {
      setActiveItem(item);
      setModifierOpen(true);
    } else {
      // Món không tùy chọn → thêm thẳng.
      addLine({ itemId: item.id, qty: 1, note: "", optionIds: [] });
    }
  };

  const changeQty = (lineId: string, qty: number) =>
    setCart((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l)));
  const removeLine = (lineId: string) =>
    setCart((prev) => prev.filter((l) => l.lineId !== lineId));

  const scrollToCat = (catId: string) => {
    const el = sectionRefs.current[catId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async () => {
    if (cart.length === 0 || !qrToken) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/r/${slug}/api/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken,
          note: orderNote,
          lines: cart.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            note: l.note,
            optionIds: l.optionIds,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error ?? "Gửi order thất bại. Vui lòng thử lại.");
        setSubmitting(false);
        return;
      }
      // Xóa giỏ + chuyển trang theo dõi.
      if (storageKey) sessionStorage.removeItem(storageKey);
      setCart([]);
      router.push(`/r/${slug}/order/${data.orderId}?t=${qrToken}`);
    } catch {
      setErrorMsg("Mất kết nối. Vui lòng thử lại.");
      setSubmitting(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto min-h-screen max-w-md bg-canvas pb-24">
        {/* Header dính */}
        <header className="sticky top-0 z-30 flex items-center gap-sm border-b border-hairline-soft bg-canvas/95 px-lg py-sm backdrop-blur">
          {menu.tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={menu.tenant.logo_url}
              alt={menu.tenant.name}
              className="h-9 w-9 rounded-md object-cover"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg">
              {menu.tenant.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-display text-base text-ink">{menu.tenant.name}</span>
            <span className="text-xs text-steel">
              {tableName ? `Bàn ${tableName}` : "Xem thực đơn"}
            </span>
          </div>
          {canOrder && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label={`Mở giỏ${cartCount > 0 ? `, ${cartCount} món` : ""}`}
              className="relative grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ShoppingBag className="h-5 w-5" />
              <AnimatePresence>
                {cartCount > 0 && (
                  <motion.span
                    key={badgePulse}
                    initial={{ scale: 0.4 }}
                    animate={{ scale: [1.4, 1] }}
                    transition={{ type: "spring", stiffness: 500, damping: 18 }}
                    className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-fg"
                  >
                    {cartCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}
        </header>

        {/* Chip danh mục — scroll-snap ngang */}
        {menu.categories.length > 1 && (
          <nav className="sticky top-[57px] z-20 border-b border-hairline-soft bg-canvas/95 backdrop-blur">
            <div className="flex snap-x gap-xs overflow-x-auto px-lg py-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {menu.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => scrollToCat(c.id)}
                  aria-current={activeCat === c.id ? "true" : undefined}
                  className={cn(
                    "snap-start whitespace-nowrap rounded-full px-md py-xs text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    activeCat === c.id
                      ? "bg-ink text-on-dark"
                      : "bg-surface text-steel hover:bg-cream"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </nav>
        )}

        {/* Danh sách món theo danh mục */}
        <main className="px-lg">
          {menu.categories.map((cat) => (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              ref={(el) => {
                sectionRefs.current[cat.id] = el;
              }}
              className="scroll-mt-[112px] pt-lg"
            >
              <h2 className="font-display text-xl text-ink">{cat.name}</h2>
              <motion.ul
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "0px 0px -80px 0px" }}
                variants={{ show: { transition: { staggerChildren: 0.05 } } }}
                className="mt-sm flex flex-col gap-sm"
              >
                {cat.items.map((it) => (
                  <motion.li
                    key={it.id}
                    variants={{
                      hidden: { opacity: 0, y: 12, scale: 0.98 },
                      show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" } },
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleItemTap(it)}
                      disabled={!canOrder || !it.is_available}
                      aria-label={`${it.name}${!it.is_available ? " (hết món)" : ""}`}
                      className={cn(
                        "flex w-full items-stretch gap-md rounded-lg border border-hairline-soft bg-canvas p-sm text-left shadow-card transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        (!canOrder || !it.is_available) && "cursor-default",
                        !it.is_available && "opacity-60"
                      )}
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-surface">
                        {it.image_url ? (
                          <Image src={it.image_url} alt={it.name} fill sizes="80px" className="object-cover" />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-[10px] text-muted">
                            Không ảnh
                          </span>
                        )}
                        {!it.is_available && (
                          <span className="absolute left-1 top-1 rounded bg-status-late px-1 text-[10px] font-semibold text-status-late-fg">
                            Hết
                          </span>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className="font-medium leading-snug text-ink [text-wrap:balance]">{it.name}</p>
                        {it.description && (
                          <p className="mt-xxs line-clamp-2 text-xs text-steel [text-wrap:pretty]">
                            {it.description}
                          </p>
                        )}
                        <div className="mt-auto flex items-end justify-between pt-sm">
                          <span className="font-semibold tabular-nums text-primary">
                            {formatVnd(it.base_price)}
                          </span>
                          {canOrder && it.is_available && (
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-fg shadow-card">
                              <Plus className="h-4 w-4" strokeWidth={2.5} />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            </section>
          ))}
          <div className="h-lg" />
        </main>

        {/* Thanh giỏ dính đáy */}
        <AnimatePresence>
          {canOrder && cartCount > 0 && !cartOpen && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-lg pb-[max(12px,env(safe-area-inset-bottom))]"
            >
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="flex h-12 w-full items-center justify-between rounded-full bg-primary px-lg text-primary-fg shadow-modal transition-colors hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <span className="flex items-center gap-sm text-sm font-medium">
                  <ShoppingBag className="h-4 w-4" />
                  Xem giỏ · {cartCount} món
                </span>
                <span className="tabular-nums text-sm font-semibold">
                  {formatVnd(
                    cart.reduce((s, l) => {
                      const it = itemMap.get(l.itemId);
                      if (!it) return s;
                      const price =
                        it.base_price +
                        it.groups
                          .flatMap((g) => g.options)
                          .filter((o) => l.optionIds.includes(o.id))
                          .reduce((a, o) => a + o.price_delta, 0);
                      return s + price * l.qty;
                    }, 0)
                  )}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <ModifierSheet
          item={activeItem}
          open={modifierOpen}
          onOpenChange={setModifierOpen}
          onAdd={addLine}
        />
        <CartSheet
          open={cartOpen}
          onOpenChange={setCartOpen}
          lines={cart}
          itemMap={itemMap}
          orderNote={orderNote}
          onOrderNoteChange={setOrderNote}
          onChangeQty={changeQty}
          onRemove={removeLine}
          onSubmit={submit}
          submitting={submitting}
          errorMsg={errorMsg}
        />
      </div>
    </MotionConfig>
  );
}
