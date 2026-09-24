import type { InventoryReport } from "@/lib/inventory/report-server";
import type { WasteSource } from "@/lib/inventory/waste";
import { formatVnd } from "@/lib/orders/cart";

const SOURCE_LABEL: Record<WasteSource, string> = {
  cancel: "Hủy sau khi đã làm",
  shortfall: "Hụt khi chế biến mẻ",
  waste: "Xuất hủy có lý do",
  unexplained: "Không giải thích được",
};

const pct = (n: number | null) => (n === null ? "–" : `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`);

/**
 * Khối "Hao hụt" (REPORT-14): tổng = Σ 4 nguồn, % trên doanh thu món thuần (cùng mẫu số khối lãi
 * gộp). "Không giải thích được" chỉ có ở nguyên liệu đã kiểm kê — không kiểm thì ghi "chưa kiểm",
 * KHÔNG ghi 0 (0 nghĩa là khớp).
 */
export function WastePanel({ data }: { data: InventoryReport }) {
  const w = data.waste;
  if (w.closedDays === 0) {
    return (
      <p className="text-sm text-steel">
        Chưa có ngày nào được chốt sổ trong kỳ này. Số hao hụt có từ ngày hôm sau của ngày đầu tiên nhập nguyên liệu.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-steel">
        Tổng hao hụt <span className="font-medium text-ink">{formatVnd(w.total)}</span> ·{" "}
        <span className="font-medium text-ink">{pct(w.pctOfRevenue)}</span> doanh thu món · {w.closedDays} ngày đã chốt.
        <span className="block text-xs">Quán vận hành tốt thường dưới 2%; trên 5% là có vấn đề cần tìm.</span>
      </p>

      <ul className="grid grid-cols-1 gap-sm sm:grid-cols-2">
        {(Object.keys(SOURCE_LABEL) as WasteSource[]).map((k) => (
          <li key={k} className="flex items-baseline justify-between rounded-md bg-surface px-md py-sm text-sm">
            <span className="text-slate">{SOURCE_LABEL[k]}</span>
            <span className="font-medium tabular-nums text-ink">{formatVnd(w.bySource[k])}</span>
          </li>
        ))}
      </ul>

      {w.ingredients.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-steel">
                <th className="py-xs pr-md font-medium">Nguyên liệu</th>
                <th className="py-xs pr-md text-right font-medium">Hủy sau làm</th>
                <th className="py-xs pr-md text-right font-medium">Hụt mẻ</th>
                <th className="py-xs pr-md text-right font-medium">Xuất hủy</th>
                <th className="py-xs pr-md text-right font-medium">Không giải thích</th>
                <th className="py-xs text-right font-medium">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {w.ingredients.map((i) => (
                <tr key={i.id} className="border-b border-hairline-soft">
                  <td className="py-sm pr-md text-ink">
                    {i.name}
                    {i.suspect && (
                      <span className="ml-xs rounded bg-status-new px-xs text-xs text-status-new-fg">
                        có thể định lượng khai sai
                      </span>
                    )}
                    {i.unpriced && <span className="ml-xs text-xs text-steel">(có ngày thiếu giá)</span>}
                  </td>
                  <td className="py-sm pr-md text-right tabular-nums">{formatVnd(i.bySource.cancel)}</td>
                  <td className="py-sm pr-md text-right tabular-nums">{formatVnd(i.bySource.shortfall)}</td>
                  <td className="py-sm pr-md text-right tabular-nums">{formatVnd(i.bySource.waste)}</td>
                  <td className="py-sm pr-md text-right tabular-nums">
                    {i.counted ? formatVnd(i.bySource.unexplained) : <span className="text-steel">chưa kiểm</span>}
                  </td>
                  <td className="py-sm text-right font-medium tabular-nums text-ink">{formatVnd(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {w.unpricedIngredients.length > 0 && (
        <p className="text-xs text-steel">Không định giá được (thiếu giá): {w.unpricedIngredients.join(", ")}.</p>
      )}
    </div>
  );
}
