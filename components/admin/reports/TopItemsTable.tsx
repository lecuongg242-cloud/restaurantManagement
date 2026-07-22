import type { TopItem } from "@/lib/billing/reports";
import { formatVnd } from "@/lib/orders/cart";

/** Bảng xếp hạng món bán chạy + thanh bar theo số lượng (thuần CSS). */
export function TopItemsTable({ items }: { items: TopItem[] }) {
  if (items.length === 0) return <p className="text-sm text-steel">Chưa có dữ liệu.</p>;
  const maxQty = Math.max(...items.map((i) => i.qty), 1);

  return (
    <ul className="flex flex-col gap-sm">
      {items.map((it, idx) => (
        <li key={it.name} className="flex items-center gap-md">
          <span className="w-5 shrink-0 text-right text-xs font-medium text-steel tabular-nums">{idx + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-sm">
              <span className="truncate text-sm text-ink">{it.name}</span>
              <span className="shrink-0 text-xs text-steel tabular-nums">
                {it.qty} · {formatVnd(it.revenue)}
              </span>
            </div>
            <div className="mt-xxs h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(it.qty / maxQty) * 100}%` }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
