"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { fetchCustomerMenu, type MenuCategory, type MenuItem } from "@/lib/menu";
import { formatVnd } from "@/lib/format";

type TenantInfo = {
  id: string;
  name: string;
  logo_url: string | null;
  address: string;
  phone: string;
};

/**
 * Menu khách mobile-first (MENU-03). Realtime: bất kỳ thay đổi menu nào
 * (hết món, ẩn/hiện, giá) → refetch và cập nhật tại chỗ ≤ 3s (MENU-02).
 * Món is_sold_out bị ẨN khỏi danh sách theo đúng MENU-02.
 */
export function MenuView({
  tenant,
  initialMenu,
  tableName,
}: {
  tenant: TenantInfo;
  initialMenu: MenuCategory[];
  tableName?: string | null;
}) {
  const [menu, setMenu] = useState(initialMenu);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [offline, setOffline] = useState(false);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(() => {
    // Gom nhiều event liền nhau thành 1 lần refetch
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(async () => {
      try {
        const supabase = createClient();
        setMenu(await fetchCustomerMenu(supabase, tenant.id));
        setOffline(false);
      } catch {
        setOffline(true);
      }
    }, 150);
  }, [tenant.id]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`menu-${tenant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "menu_items",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "menu_categories",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        refetch
      )
      .subscribe();

    const onOnline = () => {
      setOffline(false);
      refetch();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [tenant.id, refetch]);

  // MENU-02: món hết bị ẩn khỏi app khách
  const visible = menu
    .map((c) => ({ ...c, items: c.items.filter((i) => !i.is_sold_out) }))
    .filter((c) => c.items.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <header className="flex items-center gap-3 px-4 pb-3 pt-5">
        {tenant.logo_url && (
          <Image
            src={tenant.logo_url}
            alt=""
            width={52}
            height={52}
            className="h-13 w-13 shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {tenant.name}
          </h1>
          {(tenant.address || tenant.phone) && (
            <p className="truncate text-[13px] text-muted">
              {[tenant.address, tenant.phone].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {tableName && (
          <span className="shrink-0 rounded-full bg-id-customer px-3.5 py-1.5 text-[13px] font-semibold text-white">
            Bàn {tableName}
          </span>
        )}
      </header>

      {offline && (
        <p className="mx-4 mb-2 rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-amber-700">
          Mất kết nối, đang thử lại…
        </p>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-lg font-semibold">Menu đang được chuẩn bị</p>
          <p className="max-w-60 text-sm text-muted">
            Nhà hàng chưa đăng món nào. Bạn quay lại sau nhé!
          </p>
        </div>
      ) : (
        <>
          {/* Thanh danh mục dính, cuộn ngang */}
          <nav className="sticky top-0 z-10 border-b border-border-soft bg-background/95 backdrop-blur">
            <div className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
              {visible.map((c) => (
                <a
                  key={c.id}
                  href={`#cat-${c.id}`}
                  className="flex min-h-10 shrink-0 items-center rounded-full border border-border bg-background px-4 text-sm font-semibold transition-colors duration-200 hover:border-foreground"
                >
                  {c.name}
                </a>
              ))}
            </div>
          </nav>

          <div className="flex flex-col gap-7 px-4 py-5 pb-10">
            {visible.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16">
                <h2 className="mb-3 text-xl font-bold tracking-tight">
                  {c.name}
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {c.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setSelected(item)}
                        className="flex min-h-11 w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-border bg-background p-3 text-left transition-colors duration-200 hover:border-foreground"
                      >
                        <div className="min-w-0 flex-1 self-start py-0.5">
                          <p className="font-semibold leading-snug">
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">
                              {item.description}
                            </p>
                          )}
                          <p className="tabular mt-1.5 font-mono text-[15px] font-medium">
                            {formatVnd(item.price)}
                          </p>
                        </div>
                        {item.image_url && (
                          <Image
                            src={item.image_url}
                            alt=""
                            width={88}
                            height={88}
                            className="h-22 w-22 shrink-0 rounded-xl object-cover"
                            loading="lazy"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <p className="text-center text-xs text-muted">
              Quét QR tại bàn để gọi món — tính năng mở ở giai đoạn tiếp theo.
            </p>
          </div>
        </>
      )}

      {/* Bottom sheet chi tiết món */}
      {selected && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/40 backdrop-blur-[2px] [animation:fade-in_150ms_ease-out]"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-label={selected.name}
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-feature bg-background px-5 pb-6 pt-3 [animation:sheet-in_220ms_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            {selected.image_url && (
              <Image
                src={selected.image_url}
                alt=""
                width={640}
                height={360}
                className="mb-4 max-h-56 w-full rounded-2xl object-cover"
              />
            )}
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-xl font-bold tracking-tight">
                {selected.name}
              </h3>
              <span className="tabular shrink-0 font-mono text-lg font-semibold">
                {formatVnd(selected.price)}
              </span>
            </div>
            {selected.description && (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {selected.description}
              </p>
            )}

            {selected.groups.map((g) => (
              <div key={g.id} className="mt-5">
                <p className="text-sm font-semibold">
                  {g.name}
                  <span className="ml-2 font-normal text-muted">
                    {g.selection === "single" ? "chọn 1" : "chọn nhiều"}
                    {g.is_required && " · bắt buộc"}
                  </span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {g.options.map((o) => (
                    <li
                      key={o.id}
                      className="rounded-full border border-border px-3.5 py-1.5 text-sm"
                    >
                      {o.name}
                      {o.price_delta > 0 && (
                        <span className="tabular ml-1 font-mono text-[13px] text-muted">
                          +{formatVnd(o.price_delta)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <p className="mt-6 rounded-lg bg-surface px-3.5 py-2.5 text-center text-[13px] text-muted">
              Gọi món qua QR mở ở giai đoạn tiếp theo — hiện bạn có thể gọi
              nhân viên để đặt món.
            </p>
            <button
              onClick={() => setSelected(null)}
              className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border border-foreground text-sm font-semibold transition-colors duration-200 hover:bg-surface"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
