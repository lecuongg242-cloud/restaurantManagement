"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nút sao chép một giá trị (số tài khoản, nội dung chuyển khoản…). Báo "Đã chép" 2 giây. */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [daChep, setDaChep] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Sao chép ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDaChep(true);
          setTimeout(() => setDaChep(false), 2000);
        } catch {
          // Trình duyệt chặn clipboard (http, iframe): người dùng vẫn tự bôi đen được.
        }
      }}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-xxs rounded-md border border-hairline-strong px-sm text-xs text-slate hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className
      )}
    >
      {daChep ? <Check className="h-3.5 w-3.5 text-status-ready" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {daChep ? "Đã chép" : "Chép"}
    </button>
  );
}
