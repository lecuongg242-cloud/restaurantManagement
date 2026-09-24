import type { InventoryReport } from "@/lib/inventory/report-server";
import { formatShare } from "@/lib/billing/report-format";
import { formatVnd } from "@/lib/orders/cart";

const pct = (n: number | null) => (n === null ? "–" : `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`);

/**
 * Khối "Lãi gộp theo món" (REPORT-13). Xếp theo TỔNG lãi gộp đóng góp — món lãi/phần cao mà bán ít
 * có thể đóng góp ít hơn món rẻ bán chạy. Lãi gộp chỉ trên phần có giá vốn; phần thiếu giá nói ra.
 */
export function MarginPanel({ data }: { data: InventoryReport }) {
  const { items, totals } = data.margin;
  const r = data.reconcile;
  if (items.length === 0) {
    return <p className="text-sm text-steel">Kỳ này chưa có món nào được thanh toán.</p>;
  }

  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-steel">
        Lãi gộp <span className="font-medium text-ink">{formatVnd(totals.grossProfit)}</span> trên doanh thu món có giá vốn{" "}
        <span className="font-medium text-ink">{formatVnd(totals.costedRevenue)}</span>
        {totals.costedRevenue > 0 && (
          <> · giá vốn {formatShare(totals.costTotal, totals.costedRevenue)}</>
        )}
        .
      </p>
      {totals.uncostedQty > 0 && (
        <p className="rounded-md bg-status-new px-md py-xs text-sm text-status-new-fg">
          {totals.uncostedQty} phần chưa tính được giá vốn (món chưa khai định lượng, thiếu giá, hoặc bán trước khi bắt đầu
          theo dõi nguyên liệu) — không có trong tổng lãi gộp.
        </p>
      )}
      {totals.provisionalQty > 0 && (
        <p className="text-xs text-steel">Có {totals.provisionalQty} phần của hôm nay — tạm tính, chốt lại sau nửa đêm.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-steel">
              <th className="py-xs pr-md font-medium">Món</th>
              <th className="py-xs pr-md text-right font-medium">Số phần</th>
              <th className="py-xs pr-md text-right font-medium">Doanh thu thuần</th>
              <th className="py-xs pr-md text-right font-medium">Giá vốn/phần</th>
              <th className="py-xs pr-md text-right font-medium">Giá vốn %</th>
              <th className="py-xs pr-md text-right font-medium">Lãi/phần</th>
              <th className="py-xs text-right font-medium">Tổng lãi gộp</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const perPortion =
                m.grossProfit !== null && m.costedQty > 0 ? m.grossProfit / m.costedQty : null;
              return (
                <tr key={m.key} className="border-b border-hairline-soft">
                  <td className="py-sm pr-md text-ink">
                    {m.name}
                    {m.uncostedQty > 0 && (
                      <span className="ml-xs text-xs text-steel">
                        ({m.uncostedQty}/{m.qty} phần chưa có giá vốn)
                      </span>
                    )}
                  </td>
                  <td className="py-sm pr-md text-right tabular-nums">{m.qty}</td>
                  <td className="py-sm pr-md text-right tabular-nums">{formatVnd(m.netRevenue)}</td>
                  <td className="py-sm pr-md text-right tabular-nums">
                    {m.portionCost === null ? "–" : formatVnd(Math.round(m.portionCost))}
                  </td>
                  <td className="py-sm pr-md text-right tabular-nums">{pct(m.foodCostPct)}</td>
                  <td className="py-sm pr-md text-right tabular-nums">
                    {perPortion === null ? "–" : formatVnd(Math.round(perPortion))}
                  </td>
                  <td className="py-sm text-right font-medium tabular-nums text-ink">
                    {m.grossProfit === null ? "chưa đủ giá" : formatVnd(m.grossProfit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-steel">
        Doanh thu {formatVnd(r.kpi)} = món (đã trừ giảm giá) {formatVnd(r.netItem)} + phí phục vụ {formatVnd(r.service)} + VAT{" "}
        {formatVnd(r.vat)}
        {r.gap !== 0 && <> · chênh lệch làm tròn khi chia bill: {formatVnd(r.gap)}</>}.
      </p>
    </div>
  );
}
