"use client";

import { cn } from "@/lib/utils";

/**
 * Bàn phím số cho PIN. Ô ≥44px (touch AA). Thuần trình bày — không xác thực ở client.
 */
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

  return (
    <div className="flex flex-col items-center gap-lg">
      {/* Ô hiển thị PIN dạng chấm */}
      <div className="flex gap-sm" aria-label="Số ô PIN đã nhập">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border border-hairline-strong",
              i < value.length && "border-primary bg-primary"
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-sm">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled || value.length >= maxLength}
            onClick={() => onDigit(k)}
            className="h-16 w-16 rounded-lg border border-hairline-soft bg-canvas text-2xl font-medium text-ink transition-colors hover:bg-surface active:bg-cream disabled:opacity-40"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="h-16 w-16 rounded-lg border border-hairline-soft bg-canvas text-sm font-medium text-steel transition-colors hover:bg-surface disabled:opacity-40"
        >
          Xóa
        </button>
        <button
          type="button"
          disabled={disabled || value.length >= maxLength}
          onClick={() => onDigit("0")}
          className="h-16 w-16 rounded-lg border border-hairline-soft bg-canvas text-2xl font-medium text-ink transition-colors hover:bg-surface active:bg-cream disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={onBackspace}
          className="h-16 w-16 rounded-lg border border-hairline-soft bg-canvas text-xl font-medium text-steel transition-colors hover:bg-surface disabled:opacity-40"
          aria-label="Xóa lùi"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
