"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Tải lại dữ liệu server của trang theo nhịp — không tải lại cả trang, không mất vị trí cuộn.
 * Tab bị ẩn thì thôi hỏi; quay lại tab thì hỏi ngay một lần để không phải chờ hết nhịp.
 */
export function TuLamMoi({ moiMs = 30_000 }: { moiMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const hoi = () => {
      if (!document.hidden) router.refresh();
    };
    const id = setInterval(hoi, moiMs);
    document.addEventListener("visibilitychange", hoi);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", hoi);
    };
  }, [router, moiMs]);

  return null;
}
