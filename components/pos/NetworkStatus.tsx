"use client";

import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useMatMangTu, useOnline } from "@/lib/offline/use-offline";
import { gioVn } from "@/lib/time/vn";

/**
 * Dòng chữ đỏ trên cùng khi máy MẤT MẠNG (P17 17-01, OFFLINE-01) — như Sapo ("Mất kết nối internet…"). Máy
 * quầy mất wifi thì chỉ xem được; gọi món và thu tiền chuyển sang điện thoại 5G (QD-024 D1). Có mạng → ẩn.
 */
export function NetworkBanner({ slug }: { slug: string }) {
  const online = useOnline();
  const tu = useMatMangTu();
  if (online) return null;
  return (
    <div role="alert" data-network-banner className="flex flex-wrap items-center gap-sm border-b-2 border-status-late bg-status-late/10 px-lg py-sm">
      <WifiOff className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
      <span className="text-sm font-bold text-ink">Mất mạng{tu ? ` từ ${gioVn(tu.toISOString())}` : ""}</span>
      <span className="text-sm text-slate">— máy này chỉ xem được. Dùng điện thoại (4G/5G) để gọi món và thu tiền.</span>
      <Link
        href={`/r/${slug}/pos/offline`}
        className="ml-auto inline-flex min-h-[44px] items-center rounded-md border border-hairline-strong bg-canvas px-lg text-sm font-semibold text-ink hover:bg-surface"
      >
        Xem bàn &amp; đơn lúc mất mạng
      </Link>
    </div>
  );
}

/** Câu lý do khi khóa một nút ghi lúc mất mạng — một giọng cho mọi nút. */
export const KHOA_KHI_MAT_MANG = "Mất mạng — máy này không gửi được. Dùng điện thoại (4G/5G) để gọi món và thu tiền.";
