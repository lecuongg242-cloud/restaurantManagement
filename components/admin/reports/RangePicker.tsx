"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [
  { key: "today", label: "Hôm nay" },
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "week", label: "Tuần này" },
  { key: "month", label: "Tháng này" },
] as const;

type Props = {
  base: string;
  preset: string;
  offset: number;
  /** Ngày đang hiển thị (đã tính offset) — điền sẵn vào form tùy chọn. */
  fromDay: string;
  toDay: string;
  /** from/to gốc trên URL — giữ nguyên khi bấm ‹ › để offset dịch đúng độ dài kỳ. */
  baseFrom: string;
  baseTo: string;
  canGoNext: boolean;
  /** Ngày VN hôm nay — chặn chọn tương lai. */
  today: string;
  /** Tham số giữ nguyên khi đổi kỳ (vd `cn` — chi nhánh đang lọc ở báo cáo chuỗi). */
  keep?: Record<string, string>;
};

/**
 * Chọn kỳ báo cáo (REPORT-05): preset nhanh + khoảng tùy chọn + điều hướng kỳ trước/sau.
 * Lịch dùng `<input type="date">` gốc của trình duyệt — không thêm dependency.
 */
export function RangePicker({ base, preset, offset, fromDay, toDay, baseFrom, baseTo, canGoNext, today, keep }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);
  const popRef = useRef<HTMLDivElement>(null);

  // Kỳ đổi từ ngoài (bấm preset khác) → đồng bộ lại giá trị điền sẵn.
  useEffect(() => {
    setFrom(fromDay);
    setTo(toDay);
  }, [fromDay, toDay]);

  // Đóng khi bấm ra ngoài hoặc nhấn Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (params: Record<string, string>) => {
    const q = new URLSearchParams({ ...params, ...keep });
    startTransition(() => router.push(`${base}?${q.toString()}`));
  };

  const goPreset = (key: string) => {
    setOpen(false);
    go({ preset: key });
  };

  const shift = (delta: number) => {
    const params: Record<string, string> = { preset };
    if (preset === "custom") {
      params.from = baseFrom;
      params.to = baseTo;
    }
    const next = offset + delta;
    if (next !== 0) params.offset = String(next);
    go(params);
  };

  const applyCustom = () => {
    // Chọn ngược → tự đảo thay vì báo lỗi.
    const [f, t] = from <= to ? [from, to] : [to, from];
    setOpen(false);
    go({ preset: "custom", from: f, to: t });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-sm", pending && "opacity-60")}>
      <div className="inline-flex flex-wrap rounded-md border border-hairline p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => goPreset(p.key)}
            aria-pressed={preset === p.key}
            className={cn(
              "rounded px-md py-xs text-sm font-medium transition-colors",
              preset === p.key ? "bg-primary text-primary-fg" : "text-steel hover:bg-surface"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={cn(
            "inline-flex h-9 items-center gap-xs rounded-md border border-hairline px-md text-sm font-medium transition-colors",
            preset === "custom" ? "bg-primary text-primary-fg" : "text-steel hover:bg-surface"
          )}
        >
          <CalendarDays className="h-4 w-4" />
          Tùy chọn
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Chọn khoảng thời gian"
            className="absolute right-0 z-20 mt-xs w-64 rounded-lg border border-hairline bg-canvas p-md shadow-card"
          >
            <label className="block text-xs font-medium text-steel" htmlFor="range-from">
              Từ ngày
            </label>
            <input
              id="range-from"
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-xxs w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <label className="mt-sm block text-xs font-medium text-steel" htmlFor="range-to">
              Đến ngày
            </label>
            <input
              id="range-to"
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="mt-xxs w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="button"
              onClick={applyCustom}
              disabled={!from || !to}
              className="mt-md w-full rounded-md bg-primary py-xs text-sm font-medium text-primary-fg disabled:opacity-40"
            >
              Áp dụng
            </button>
          </div>
        )}
      </div>

      <div className="inline-flex items-center gap-xxs">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Kỳ trước"
          className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!canGoNext}
          aria-label="Kỳ sau"
          className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
