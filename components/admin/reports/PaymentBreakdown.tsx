import type { PaymentSlice } from "@/lib/billing/reports";
import { formatVnd } from "@/lib/orders/cart";

const LABEL: Record<string, string> = { cash: "Tiền mặt", transfer: "Chuyển khoản" };

/** Tách doanh thu theo phương thức thanh toán (REPORT-03) — đối soát chốt ca. */
export function PaymentBreakdown({ payments, total }: { payments: PaymentSlice[]; total: number }) {
  const sum = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="flex flex-col gap-md">
      {payments.map((p) => {
        const pct = sum > 0 ? Math.round((p.amount / sum) * 100) : 0;
        return (
          <div key={p.method}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink">{LABEL[p.method] ?? p.method}</span>
              <span className="text-sm font-medium tabular-nums text-ink">
                {formatVnd(p.amount)} <span className="text-xs font-normal text-steel">· {p.count} HĐ · {pct}%</span>
              </span>
            </div>
            <div className="mt-xxs h-2 w-full overflow-hidden rounded-full bg-surface">
              <div className={"h-full rounded-full " + (p.method === "cash" ? "bg-primary" : "bg-steel")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <div className="mt-xs flex justify-between border-t border-hairline pt-sm text-sm">
        <span className="text-steel">Tổng đối soát</span>
        <span className={"font-semibold tabular-nums " + (sum === total ? "text-status-ready" : "text-status-late")}>
          {formatVnd(sum)}
        </span>
      </div>
    </div>
  );
}
