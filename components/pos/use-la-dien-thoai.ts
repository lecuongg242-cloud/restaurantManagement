"use client";

import { useSyncExternalStore } from "react";

/** Cùng mốc với `max-sm:` của Tailwind (sm = 640px). */
const MQ = "(max-width: 639px)";

/**
 * Đang ở khổ điện thoại không. Dùng cho chỗ CSS không đủ: hộp "Sửa món" mở từ ngăn giỏ hàng phải là bottom
 * sheet có portal — hộp giữa màn (không portal) nằm trong panel đang ẩn nên không hiện, mà ngăn kéo vaul
 * cũng chặn bấm vào thứ nằm ngoài nó. Server render = không phải điện thoại.
 */
export function useLaDienThoai(): boolean {
  return useSyncExternalStore(
    (doi) => {
      const m = window.matchMedia(MQ);
      m.addEventListener("change", doi);
      return () => m.removeEventListener("change", doi);
    },
    () => window.matchMedia(MQ).matches,
    () => false
  );
}
