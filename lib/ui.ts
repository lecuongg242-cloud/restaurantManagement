/**
 * Class dùng chung theo style-guide (QD-003 — ngôn ngữ MiniMax):
 * nút pill rounded-full, input bo 8px + focus ring, chữ phụ text-muted.
 * Dùng các chuỗi này thay vì tự ghép để UI đồng nhất giữa các trang.
 */

export const btn = {
  primary:
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-on-primary transition-opacity duration-200 hover:opacity-85 disabled:cursor-default disabled:bg-border disabled:text-muted",
  secondary:
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-foreground px-6 text-sm font-semibold transition-colors duration-200 hover:bg-surface",
  tertiary:
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-semibold transition-colors duration-200 hover:border-foreground",
  danger:
    "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-destructive/40 px-5 text-sm font-semibold text-destructive transition-colors duration-200 hover:bg-destructive/10",
  smTertiary:
    "inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-border bg-background px-4 text-[13px] font-semibold transition-colors duration-200 hover:border-foreground",
  smDanger:
    "inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-destructive/40 px-4 text-[13px] font-semibold text-destructive transition-colors duration-200 hover:bg-destructive/10",
  smSuccess:
    "inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-success/40 px-4 text-[13px] font-semibold text-success transition-colors duration-200 hover:bg-success-bg",
} as const;

export const input =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base outline-none transition-colors duration-200 focus:border-ring focus:ring-2 focus:ring-ring/25";

export const alertError =
  "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive";
export const alertOk = "rounded-lg bg-success-bg px-3 py-2 text-sm text-success";

/** Eyebrow đầu trang admin: chấm màu định danh + nhãn nhỏ. */
export const eyebrow =
  "flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted";
