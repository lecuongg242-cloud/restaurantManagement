"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getPrintAdapter, type PrintAdapter } from "@/lib/print/adapter";
import { SU_KIEN_THONG_BAO_IN, type ThongBaoIn } from "@/lib/print/thong-bao-in";
import type { PrintMode } from "@/lib/tenant/settings";

/**
 * Chế độ in của quán cho các component in (PRINT-10). Trang server đọc `tenants.settings.print_mode`
 * rồi bọc bề mặt bằng `PrintModeProvider`. Thiếu provider → `browser`: đường in an toàn nhất, không
 * cần gì ngoài máy có máy in — lỡ quên bọc thì không đẩy phiếu vào hàng đợi không ai lấy.
 *
 * Provider cũng hiển thị THÔNG BÁO IN (PRINT-16): "đã gửi ra máy in quầy", "cầu in không chạy"… —
 * adapter in là hàm thường nên báo qua sự kiện (`lib/print/thong-bao-in.ts`).
 */
const PrintModeContext = createContext<PrintMode>("browser");

export function PrintModeProvider({ mode, children }: { mode: PrintMode; children: React.ReactNode }) {
  return (
    <PrintModeContext.Provider value={mode}>
      {children}
      <ThongBaoInHost />
    </PrintModeContext.Provider>
  );
}

export function usePrintMode(): PrintMode {
  return useContext(PrintModeContext);
}

export function usePrintAdapter(): PrintAdapter {
  return getPrintAdapter(usePrintMode());
}

function ThongBaoInHost() {
  const [tb, setTb] = useState<ThongBaoIn | null>(null);

  useEffect(() => {
    let hen: ReturnType<typeof setTimeout> | undefined;
    const nghe = (e: Event) => {
      setTb((e as CustomEvent<ThongBaoIn>).detail);
      clearTimeout(hen);
      hen = setTimeout(() => setTb(null), 4000);
    };
    window.addEventListener(SU_KIEN_THONG_BAO_IN, nghe);
    return () => {
      window.removeEventListener(SU_KIEN_THONG_BAO_IN, nghe);
      clearTimeout(hen);
    };
  }, []);

  if (!tb) return null;
  return (
    <div
      role={tb.loai === "loi" ? "alert" : "status"}
      className={
        "fixed inset-x-md bottom-20 z-[80] mx-auto max-w-md rounded-lg px-md py-sm text-sm font-medium shadow-modal sm:bottom-md " +
        (tb.loai === "loi" ? "bg-status-late text-white" : "bg-ink text-canvas")
      }
    >
      {tb.noiDung}
    </div>
  );
}
