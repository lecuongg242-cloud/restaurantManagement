"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Khai báo tại chỗ (không import từ lib/flash — file đó dùng next/headers, chỉ chạy server).
const FLASH_COOKIE = "admin_flash";
export type Flash = { id: string; type: "ok" | "error"; message: string };

type Item = Flash & { key: number };

/**
 * Toaster: nhận `flash` (đọc từ cookie ở layout). Mỗi khi flash.id đổi → đẩy 1 toast,
 * tự ẩn sau 4s, đóng được. Xoá cookie sau khi hiện để không lặp lại ở lần render sau.
 * Vùng chứa fixed góc trên-phải (mobile: trên-giữa), không chắn thao tác (pointer-events).
 */
export function Toaster({ flash }: { flash: Flash | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const seen = useRef<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!flash || flash.id === seen.current) return;
    seen.current = flash.id;

    const key = ++seq.current;
    setItems((cur) => [...cur, { ...flash, key }]);
    // Xoá cookie để lần điều hướng/render sau không hiện lại toast cũ.
    document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0`;

    const t = setTimeout(() => {
      setItems((cur) => cur.filter((i) => i.key !== key));
    }, 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const dismiss = (key: number) => setItems((cur) => cur.filter((i) => i.key !== key));

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-xs p-md sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {items.map((i) => (
        <div
          key={i.key}
          role={i.type === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-sm rounded-md border px-md py-sm text-sm shadow-modal",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 sm:motion-safe:slide-in-from-right-4",
            i.type === "error"
              ? "border-status-late bg-cream-soft text-status-late"
              : "border-status-ready bg-status-ready-bg text-status-ready"
          )}
        >
          <span className="mt-[1px] flex-1 leading-snug">{i.message}</span>
          <button
            type="button"
            onClick={() => dismiss(i.key)}
            aria-label="Đóng thông báo"
            className="-mr-xxs -mt-xxs shrink-0 rounded p-xxs text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
              <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
