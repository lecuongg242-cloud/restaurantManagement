import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  /** Biến động % so kỳ trước; null = kỳ trước không có dữ liệu (không chia cho 0). */
  delta?: number | null;
  /** Dòng phụ, vd "kỳ trước: 95.000.000đ". */
  hint?: string;
  accent?: boolean;
};

/** Ô chỉ số kèm biến động so kỳ trước (REPORT-07). */
export function KpiCard({ label, value, delta, hint, accent }: Props) {
  const showDelta = delta !== undefined;
  const up = (delta ?? 0) > 0;
  const flat = delta === 0;
  const Icon = delta === null || flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-lg border border-hairline bg-canvas p-lg shadow-card">
      <p className="text-sm text-steel">{label}</p>
      <p className={cn("mt-xs text-2xl font-semibold tabular-nums", accent ? "text-primary" : "text-ink")}>
        {value}
      </p>
      {showDelta && (
        <p
          className={cn(
            "mt-xxs inline-flex items-center gap-xxs text-xs font-medium tabular-nums",
            delta === null || flat ? "text-steel" : up ? "text-status-ready" : "text-status-late"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {delta === null ? "Kỳ trước chưa có dữ liệu" : `${up ? "+" : ""}${delta}% so kỳ trước`}
        </p>
      )}
      {/* delta null đã nói "kỳ trước chưa có dữ liệu" — khỏi lặp lại bằng "Kỳ trước: 0đ". */}
      {hint && delta !== null && <p className="mt-xxs text-xs text-steel">{hint}</p>}
    </div>
  );
}
