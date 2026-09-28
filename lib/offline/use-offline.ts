"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PosSnapshot } from "@/lib/orders/pos";
import type { CustomerMenu } from "@/lib/orders/customer-menu";
import { luuBanChup, taoBanChup } from "@/lib/offline/snapshot";

/**
 * Trạng thái mạng (P17 17-01). `navigator.onLine = false` là chắc chắn mất mạng, nhưng `true` chỉ nghĩa là còn
 * nối wifi — router quán còn điện mà nhà mạng đứt thì trình duyệt vẫn báo "online". Vì vậy thêm một lượt DÒ mỗi
 * 20 giây: tải đầu tệp tĩnh `/sw.js` (CDN phục vụ, không tốn lượt chạy hàm server). Dò hỏng = mất mạng.
 * Một bộ dò dùng chung cho mọi component trong trang.
 */
const DO_MS = 20_000;
let online = true;
/** Đã có ít nhất một lượt dò xong — trước đó `online` chỉ là lời của `navigator.onLine`. */
let daDo = false;
let hen: ReturnType<typeof setInterval> | null = null;
const nghe = new Set<() => void>();

function datTrangThai(v: boolean) {
  const moiDo = !daDo;
  daDo = true;
  if (v === online && !moiDo) return;
  online = v;
  nghe.forEach((f) => f());
}

async function doMang() {
  if (!navigator.onLine) return datTrangThai(false);
  try {
    const r = await fetch(`/sw.js?do=${Date.now()}`, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(8000) });
    datTrangThai(r.ok);
  } catch {
    datTrangThai(false);
  }
}

function dangKy(bao: () => void) {
  nghe.add(bao);
  if (nghe.size === 1) {
    online = navigator.onLine;
    window.addEventListener("online", doMang);
    window.addEventListener("offline", doMang);
    hen = setInterval(doMang, DO_MS);
    doMang();
  }
  return () => {
    nghe.delete(bao);
    if (nghe.size === 0) {
      window.removeEventListener("online", doMang);
      window.removeEventListener("offline", doMang);
      if (hen) clearInterval(hen);
      hen = null;
    }
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(dangKy, () => online, () => true);
}

/** Chỉ `true` khi một lượt dò ĐÃ tới được server — cho màn offline nói "Đã có mạng lại" mà không nói sớm. */
export function useOnlineDaXacNhan(): boolean {
  return useSyncExternalStore(dangKy, () => online && daDo, () => false);
}

/** Lúc bắt đầu mất mạng (giờ máy) — cho chip "Mất mạng từ HH:mm". null khi đang có mạng. */
export function useMatMangTu(): Date | null {
  const online = useOnline();
  const [tu, setTu] = useState<Date | null>(null);
  useEffect(() => {
    setTu((cu) => (online ? null : (cu ?? new Date())));
  }, [online]);
  return tu;
}

/**
 * Chuẩn bị cho lúc mất mạng: đăng ký service worker, nhờ nó nạp sẵn trang xem offline của quán, và lưu bản chụp
 * mỗi lần POS nhận dữ liệu mới từ server. Chỉ ghi khi đang có mạng — dữ liệu lúc offline không mới hơn bản đã lưu.
 */
export function useOfflineShell(slug: string, snapshot: PosSnapshot, menu: CustomerMenu | null) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const url = `/r/${slug}/pos/offline`;
    navigator.serviceWorker
      .register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "0"}`)
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => reg.active?.postMessage({ type: "nap-truoc", url }))
      .catch(() => {
        /* trình duyệt chặn service worker (tab ẩn danh, http) → POS online vẫn chạy như trước */
      });
  }, [slug]);

  useEffect(() => {
    if (!navigator.onLine) return;
    luuBanChup(taoBanChup(slug, snapshot, menu, new Date()));
  }, [slug, snapshot, menu]);
}
