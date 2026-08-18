import type { DiscountData } from "@/lib/billing/reports";
import { cancelActorLabel, hasActorName, ROLE_LABEL } from "@/lib/billing/cancel-actor";
import { formatShare } from "@/lib/billing/report-format";
import { formatVnd } from "@/lib/orders/cart";

/**
 * Khối "Giảm giá" (REPORT-12): ai duyệt · số lượt · tổng tiền giảm · tỷ lệ trên doanh thu.
 *
 * VÌ SAO ĐỨNG CẠNH KHỐI HỦY: giảm 100% cho ra đúng kết quả như hủy sạch món, chỉ khác là hóa đơn
 * vẫn tồn tại. Hai khối đọc cùng nhau mới thấy hết bức tranh một kỳ.
 *
 * Dòng "Không rõ" là các lượt giảm có TRƯỚC migration 0037 — khi đó cổng PIN vẫn chạy nhưng hệ
 * thống không lưu lại ai duyệt. Không suy đoán ngược, cứ để trống.
 *
 * Tiền giảm lọc theo `paid_at` + quy ước doanh thu BILL-05 nên mẫu số tỷ lệ đúng bằng KPI
 * "Doanh thu" của trang.
 */
export function DiscountPanel({ data, revenue }: { data: DiscountData; revenue: number }) {
  if (data.billCnt === 0) {
    return <p className="text-sm text-steel">Kỳ này không có hóa đơn nào được giảm giá.</p>;
  }

  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-steel">
        <span className="font-medium text-ink">{data.billCnt}</span> lượt giảm giá ·{" "}
        <span className="font-medium text-ink">{formatVnd(data.amount)}</span> ·{" "}
        <span className="font-medium text-ink">{formatShare(data.amount, revenue)}</span> trên doanh thu
        kỳ này.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-steel">
              <th className="py-xs pr-md font-medium">Người duyệt</th>
              <th className="py-xs pr-md text-right font-medium">Số lượt</th>
              <th className="py-xs pr-md text-right font-medium">Tiền giảm</th>
              <th className="py-xs text-right font-medium">Trên doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {data.actors.map((a) => {
              const hasName = hasActorName(a.name);
              return (
                <tr key={a.membershipId ?? "unknown"} className="border-b border-hairline-soft">
                  <td className="py-sm pr-md text-ink">
                    {cancelActorLabel(a)}
                    {hasName && ROLE_LABEL[a.role] && (
                      <span className="ml-xs text-xs text-steel">({ROLE_LABEL[a.role]})</span>
                    )}
                  </td>
                  <td className="py-sm pr-md text-right tabular-nums text-ink">{a.cnt}</td>
                  <td className="py-sm pr-md text-right tabular-nums text-ink">{formatVnd(a.amount)}</td>
                  <td className="py-sm text-right tabular-nums text-steel">
                    {formatShare(a.amount, revenue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Chỉ hiện khi thật sự có dòng không tra ra người duyệt — đỡ một dòng chữ thừa cho kỳ sạch. */}
      {data.actors.some((a) => a.membershipId === null) && (
        <p className="text-xs text-steel">
          Lượt giảm ghi <strong className="font-medium text-ink">Không rõ</strong> là giảm giá có trước
          17/08/2026: hệ thống khi đó chưa lưu người duyệt.
        </p>
      )}
    </div>
  );
}
