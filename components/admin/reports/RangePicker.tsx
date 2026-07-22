"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Bucket } from "@/lib/billing/reports";
import { cn } from "@/lib/utils";

/** Chọn kỳ báo cáo: Ngày/Tuần/Tháng + điều hướng kỳ trước/sau (cập nhật URL searchParams). */
export function RangePicker({ base, bucket, offset }: { base: string; bucket: Bucket; offset: number }) {
  const router = useRouter();
  const go = (b: Bucket, o: number) => router.push(`${base}?bucket=${b}&offset=${o}`);

  const buckets: { key: Bucket; label: string }[] = [
    { key: "day", label: "Ngày" },
    { key: "week", label: "Tuần" },
    { key: "month", label: "Tháng" },
  ];

  return (
    <div className="flex items-center gap-sm">
      <div className="inline-flex rounded-md border border-hairline p-0.5">
        {buckets.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => go(b.key, 0)}
            className={cn(
              "rounded px-md py-xs text-sm font-medium transition-colors",
              bucket === b.key ? "bg-primary text-primary-fg" : "text-steel hover:bg-surface"
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="inline-flex items-center gap-xxs">
        <button
          type="button"
          onClick={() => go(bucket, offset - 1)}
          aria-label="Kỳ trước"
          className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => go(bucket, Math.min(0, offset + 1))}
          disabled={offset >= 0}
          aria-label="Kỳ sau"
          className="grid h-9 w-9 place-items-center rounded-md border border-hairline text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
