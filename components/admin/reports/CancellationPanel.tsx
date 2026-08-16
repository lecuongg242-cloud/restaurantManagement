import type { CancellationData, CancelSummary, CancelActorSlice } from "@/lib/billing/reports";
import { cancelRateLabel, cancelRateDeltaPoints } from "@/lib/billing/cancel-format";
import { deltaPct } from "@/lib/billing/report-range";
import { formatVnd } from "@/lib/orders/cart";
import { KpiCard } from "./KpiCard";

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Máy trạm",
};

const VN_OFFSET = 7 * 3600 * 1000;

/** "HH:MM dd/mm" giờ VN — kỳ báo cáo có thể trải nhiều ngày nên phải kèm ngày. */
function vnStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET).toISOString();
  return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/**
 * Tên hiển thị chính cho một người duyệt hủy trong bảng "Theo người duyệt". RPC
 * `report_cancel_by_actor` (Task 5) coalesce tên rỗng thành "—" — in thẳng ký tự đó ra một dòng
 * chữ liền mạch thì mâu thuẫn với quyết định đã chốt ở lịch sử POS (Task 3, `lib/orders/cancel-label.ts`):
 * không tra được tên thì RƠI VỀ VAI TRÒ, không in ký tự rác.
 */
function actorLabel(a: CancelActorSlice): string {
  if (a.name && a.name !== "—") return a.name;
  return ROLE_LABEL[a.role] || "Không rõ";
}

/**
 * Khối "Món bị hủy" (REPORT-10) — gồm CẢ đơn tại bàn lẫn mang về.
 *
 * Con số tiền ở đây là GIÁ TRỊ MÓN BỊ HỦY, không phải doanh thu mất: khách hủy phở rồi gọi bún
 * thì quán không mất đồng nào. Ghi chú thẳng dưới KPI vì đặt cạnh các khối doanh thu khác rất
 * dễ bị trừ nhầm vào doanh thu.
 */
export function CancellationPanel({ data, prev }: { data: CancellationData; prev: CancelSummary }) {
  const { summary, actors, items, rows } = data;

  if (summary.cancelledQty === 0) {
    return <p className="text-sm text-steel">Kỳ này không có món nào bị hủy.</p>;
  }

  const ratePoints = cancelRateDeltaPoints(summary, prev);

  return (
    <div className="flex flex-col gap-lg">
      <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
        <KpiCard
          label="Số món bị hủy"
          value={`${summary.cancelledQty} món`}
          delta={deltaPct(summary.cancelledQty, prev.cancelledQty)}
          hint={`Kỳ trước: ${prev.cancelledQty} món`}
        />
        <KpiCard
          label="Giá trị món bị hủy"
          value={formatVnd(summary.cancelledAmount)}
          delta={deltaPct(summary.cancelledAmount, prev.cancelledAmount)}
          hint={`Kỳ trước: ${formatVnd(prev.cancelledAmount)}`}
        />
        <KpiCard
          label="Tỷ lệ hủy"
          value={cancelRateLabel(summary.cancelledQty, summary.orderedQty)}
          hint={
            // ratePoints === null gộp HAI nguyên nhân khác nhau: mẫu số kỳ NÀY rỗng hay mẫu số kỳ
            // TRƯỚC rỗng. Phải tách vì tử số (cancelledQty) lọc theo cancelled_at còn mẫu số
            // (orderedQty) lọc theo created_at — hai cửa sổ độc lập, nên kỳ này thừa sức có
            // orderedQty = 0 mà vẫn có món bị hủy (huỷ nốt đơn tồn từ hôm trước). Kiểm kỳ này
            // TRƯỚC vì nó bằng 0 thì ratePoints cũng luôn là null, nếu không sẽ nuốt mất ca này.
            summary.orderedQty <= 0
              ? "Chưa có món nào được gọi trong kỳ này"
              : ratePoints === null
                ? "Kỳ trước chưa đủ dữ liệu để so sánh"
                : `${ratePoints > 0 ? "+" : ""}${String(ratePoints).replace(".", ",")} điểm so kỳ trước · trên ${summary.orderedQty} món đã gọi`
          }
        />
      </div>

      <p className="text-xs text-steel">
        Đây là <strong className="font-medium text-ink">giá trị món bị hủy</strong>, không phải doanh thu
        mất — khách hủy món này thường gọi món khác thay thế.
      </p>

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
        <div>
          <h3 className="mb-sm text-sm font-medium text-ink">Theo người duyệt hủy</h3>
          <ul className="flex flex-col divide-y divide-hairline-soft">
            {actors.map((a) => {
              const hasName = !!a.name && a.name !== "—";
              return (
                <li
                  key={a.membershipId ?? "unknown"}
                  className="flex items-baseline justify-between gap-md py-xs"
                >
                  <span className="min-w-0 truncate text-sm text-ink">
                    {actorLabel(a)}
                    {hasName && ROLE_LABEL[a.role] && (
                      <span className="ml-xs text-xs text-steel">({ROLE_LABEL[a.role]})</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-steel">
                    {a.qty} món · <span className="font-medium text-ink">{formatVnd(a.amount)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h3 className="mb-sm text-sm font-medium text-ink">Món bị hủy nhiều nhất</h3>
          <ul className="flex flex-col divide-y divide-hairline-soft">
            {items.map((i) => (
              <li key={i.name} className="flex items-baseline justify-between gap-md py-xs">
                <span className="min-w-0 truncate text-sm text-ink">{i.name}</span>
                <span className="shrink-0 text-sm tabular-nums text-steel">
                  {i.qty} món · <span className="font-medium text-ink">{formatVnd(i.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 className="mb-sm text-sm font-medium text-ink">Chi tiết</h3>
        {/* Bảng rộng tự cuộn ngang trong khung của nó — trang không được cuộn ngang theo. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-steel">
                <th className="py-xs pr-md font-medium">Lúc</th>
                <th className="py-xs pr-md font-medium">Nơi</th>
                <th className="py-xs pr-md font-medium">Món</th>
                <th className="py-xs pr-md text-right font-medium">SL</th>
                <th className="py-xs pr-md text-right font-medium">Giá trị</th>
                <th className="py-xs pr-md font-medium">Lý do</th>
                <th className="py-xs font-medium">Người duyệt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.cancelledAt}-${idx}`} className="border-b border-hairline-soft">
                  <td className="py-sm pr-md whitespace-nowrap tabular-nums text-steel">
                    {vnStamp(r.cancelledAt)}
                  </td>
                  <td className="py-sm pr-md whitespace-nowrap text-ink">{r.place}</td>
                  <td className="py-sm pr-md text-ink">{r.itemName}</td>
                  <td className="py-sm pr-md text-right tabular-nums text-ink">{r.qty}</td>
                  <td className="py-sm pr-md text-right tabular-nums text-ink">{formatVnd(r.amount)}</td>
                  <td className="py-sm pr-md text-steel">{r.reason}</td>
                  <td className="py-sm whitespace-nowrap text-steel">{r.actorName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.hasMore && (
          <p className="mt-sm text-xs text-steel">
            Chỉ hiện {rows.length} lượt hủy gần nhất của kỳ này. Thu hẹp khoảng ngày để xem phần còn lại.
          </p>
        )}
      </div>
    </div>
  );
}
