import type { DongBan } from "@/lib/reports/deep";
import { formatVnd } from "@/lib/orders/cart";

/**
 * Hiệu quả bàn (P16 16-03, REPORT-17) — như "Báo cáo phân tích phòng bàn" của KiotViet: lượt khách, thời gian ngồi TB,
 * doanh thu mỗi lượt, mỗi giờ ngồi. Xếp cao → thấp. Tên bàn/khu chụp lúc bán (bàn đã xóa vẫn đúng tên).
 */
export function TableUsagePanel({ rows }: { rows: DongBan[] }) {
  if (!rows.some((r) => r.ban !== "Không gắn bàn")) {
    return <p className="text-sm text-steel">Chưa có hóa đơn gắn bàn trong kỳ.</p>;
  }
  return (
    <div className="overflow-x-auto" data-khoi-ban>
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-xs pr-md font-medium">Bàn</th>
            <th className="py-xs pr-md text-right font-medium">Lượt</th>
            <th className="py-xs pr-md text-right font-medium">Ngồi TB</th>
            <th className="py-xs pr-md text-right font-medium">Doanh thu</th>
            <th className="py-xs pr-md text-right font-medium">/ lượt</th>
            <th className="py-xs text-right font-medium">/ giờ ngồi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline-soft">
          {rows.map((r) => (
            <tr key={`${r.khu}|${r.ban}`}>
              <td className="py-xs pr-md text-ink">
                {r.ban}
                {r.khu && <span className="ml-xxs text-xs text-steel">· {r.khu}</span>}
              </td>
              <td className="py-xs pr-md text-right tabular-nums">{r.luot || "—"}</td>
              <td className="py-xs pr-md text-right tabular-nums">{r.phutTb == null ? "—" : `${r.phutTb} phút`}</td>
              <td className="py-xs pr-md text-right tabular-nums text-ink">{formatVnd(r.doanhThu)}</td>
              <td className="py-xs pr-md text-right tabular-nums">{r.moiLuot == null ? "—" : formatVnd(r.moiLuot)}</td>
              <td className="py-xs text-right tabular-nums">{r.moiGio == null ? "—" : formatVnd(r.moiGio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
