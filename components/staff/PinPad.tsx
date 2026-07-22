"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Bàn phím số cho PIN. Ô 64px (>44px touch AA). Thuần trình bày — không xác thực ở client.
 * UX: phản hồi chạm (haptic nhẹ), focus-visible ring cho bàn phím, tôn trọng reduced-motion,
 * thông báo tiến trình cho screen reader.
 */
function haptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(8);
    } catch {
      /* no-op */
    }
  }
}

const keyBase =
  "grid h-16 w-16 place-items-center rounded-lg border border-hairline-soft bg-canvas text-2xl font-medium text-ink transition-colors duration-150 motion-reduce:transition-none hover:bg-surface active:bg-cream disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function PinPad({
  value,
  onDigit,
  onBackspace,
  onClear,
  maxLength = 4,
  disabled,
}: {
  value: string;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const pressDigit = (d: string) => {
    haptic();
    onDigit(d);
  };

  // Nhập PIN bằng bàn phím vật lý. Bỏ qua khi đang gõ trong ô nhập text (vd lý do hủy).
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (/^[0-9]$/.test(e.key)) {
        if (value.length < maxLength) {
          e.preventDefault();
          onDigit(e.key);
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onBackspace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, value.length, maxLength, onDigit, onBackspace]);

  return (
    <div className="flex flex-col items-center gap-lg">
      {/* Ô hiển thị PIN dạng chấm */}
      <div className="flex gap-sm" aria-hidden="true">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border border-hairline-strong transition-colors duration-150 motion-reduce:transition-none",
              i < value.length && "border-primary bg-primary"
            )}
          />
        ))}
      </div>
      {/* Thông báo tiến trình cho screen reader */}
      <span className="sr-only" role="status" aria-live="polite">
        Đã nhập {value.length} trên {maxLength} chữ số PIN
      </span>

      <div className="grid grid-cols-3 gap-sm">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled || value.length >= maxLength}
            onClick={() => pressDigit(k)}
            className={keyBase}
            aria-label={`Số ${k}`}
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => {
            haptic();
            onClear();
          }}
          className={cn(keyBase, "text-sm text-steel")}
        >
          Xóa
        </button>
        <button
          type="button"
          disabled={disabled || value.length >= maxLength}
          onClick={() => pressDigit("0")}
          className={keyBase}
          aria-label="Số 0"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={() => {
            haptic();
            onBackspace();
          }}
          className={cn(keyBase, "text-xl text-steel")}
          aria-label="Xóa lùi một số"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
