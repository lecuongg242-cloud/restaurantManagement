"use client";

import { useRouter } from "next/navigation";

/**
 * Dòng bảng bấm được cả dòng (như danh sách phiếu của KiotViet). Link trong dòng (mã phiếu) vẫn giữ để dùng bàn phím và
 * mở tab mới; bấm vào link thì để link tự xử lý, không đẩy trang hai lần.
 */
export function ClickableRow({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className={`cursor-pointer ${className ?? ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, select")) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
