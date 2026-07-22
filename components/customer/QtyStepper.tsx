"use client";

import { Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * qty-stepper (§5.2) — 2 nút tròn ± + số nảy spring khi đổi. Touch ≥44px.
 * Dùng ở ModifierSheet + CartSheet.
 */
export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className={cn("inline-flex items-center gap-xs", className)}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Giảm số lượng"
        className="grid h-11 w-11 place-items-center rounded-full border border-hairline-strong text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>

      <div className="relative grid h-11 w-10 place-items-center overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ y: 8, opacity: 0, scale: 0.8 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -8, opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className="text-base font-semibold tabular-nums text-ink"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Tăng số lượng"
        className="grid h-11 w-11 place-items-center rounded-full border border-hairline-strong text-ink transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
