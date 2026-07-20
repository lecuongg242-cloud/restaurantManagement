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
      <header className="flex items-center gap-3 p-4 pb-2">
        {tenant.logo_url && (
          <Image
            src={tenant.logo_url}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-input object-cover"
          />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{tenant.name}</h1>
          <p className="truncate text-xs opacity-60">
            {[tenant.address, tenant.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        {tableName && (
          <span className="ml-auto shrink-0 rounded-full bg-id-customer/10 px-3 py-1 text-sm font-medium text-id-customer">
            Bàn {tableName}
          </span>
        )}
      </header>

      {offline && (
        <p className="mx-4 mb-2 rounded-input bg-warning/10 px-3 py-2 text-sm text-warning">
          Mất kết nối, đang thử lại…
        </p>
      )}

      {visible.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-8 text-center opacity-60">
          Nhà hàng chưa đăng món nào. Bạn quay lại sau nhé!
        </p>
      ) : (
        <>
          {/* Thanh danh mục dính, cuộn ngang */}
          <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-border-soft bg-background px-4 py-2">
            {visible.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.id}`}
                className="flex min-h-11 shrink-0 items-center rounded-full border border-border px-4 text-sm font-medium"
              >
                {c.name}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-6 p-4">
            {visible.map((c) => (
              <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16">
                <h2 className="mb-2 text-lg font-bold">{c.name}</h2>
                <ul className="flex flex-col gap-2">
                  {c.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => setSelected(item)}
                        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-card border border-border p-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.name}</p>
                          {item.description && (
                            <p className="line-clamp-2 text-sm opacity-60">
                              {item.description}
                            </p>
                          )}
                          <p className="mt-1 text-sm font-semibold">
                            {formatVnd(item.price)}
                          </p>
                        </div>
                        {item.image_url && (
                          <Image
                            src={item.image_url}
                            alt=""
                            width={80}
                            height={80}
                            className="h-20 w-20 shrink-0 rounded-input object-cover"
                            loading="lazy"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {/* Bottom sheet chi tiết món */}
      {selected && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-black/40"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-label={selected.name}
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-feature bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {selected.image_url && (
              <Image
                src={selected.image_url}
                alt=""
                width={640}
                height={360}
                className="mb-4 max-h-56 w-full rounded-card object-cover"
              />
            )}
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-xl font-bold">{selected.name}</h3>
              <span className="shrink-0 font-semibold">
                {formatVnd(selected.price)}
              </span>
            </div>
            {selected.description && (
              <p className="mt-1 text-sm opacity-70">{selected.description}</p>
            )}

            {selected.groups.map((g) => (
              <div key={g.id} className="mt-4">
                <p className="text-sm font-semibold">
                  {g.name}
                  <span className="ml-2 font-normal opacity-60">
                    {g.selection === "single" ? "chọn 1" : "chọn nhiều"}
                    {g.is_required && " · bắt buộc"}
                  </span>
                </p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {g.options.map((o) => (
                    <li
                      key={o.id}
                      className="rounded-full border border-border px-3 py-1 text-sm"
                    >
                      {o.name}
                      {o.price_delta > 0 && (
                        <span className="opacity-60"> +{formatVnd(o.price_delta)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <p className="mt-5 rounded-input bg-surface px-3 py-2 text-center text-sm opacity-70">
              Gọi món qua QR sẽ mở ở giai đoạn tiếp theo — hiện bạn có thể gọi
              nhân viên để đặt món.
            </p>
            <button
              onClick={() => setSelected(null)}
              className="mt-3 min-h-11 w-full cursor-pointer rounded-full border border-border font-medium"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
