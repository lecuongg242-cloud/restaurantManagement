import type { CancellationData, CancelSummary, CancelSignatureRow } from "@/lib/billing/reports";
import { cancelRateLabel, cancelRateDeltaPoints } from "@/lib/billing/cancel-format";
import { cancelActorLabel, hasActorName, ROLE_LABEL } from "@/lib/billing/cancel-actor";
import { afterPrintVerdict, afterPrintNote, afterPrintHint, VERDICT_EMPTY } from "@/lib/billing/after-print";
import { deltaPct } from "@/lib/billing/report-range";
import { formatVnd } from "@/lib/orders/cart";
import { KpiCard } from "./KpiCard";

const VN_OFFSET = 7 * 3600 * 1000;

/** "HH:MM dd/mm" giờ VN — kỳ báo cáo có thể trải nhiều ngày nên phải kèm ngày. */
function vnStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + VN_OFFSET).toISOString();
  return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/**
 * Khối "Món bị hủy" (REPORT-10) — gồm CẢ đơn tại bàn lẫn mang về.
 *
 * Con số tiền ở đây là GIÁ TRỊ MÓN BỊ HỦY, không phải doanh thu mất: khách hủy phở rồi gọi bún
 * thì quán không mất đồng nào. Ghi chú thẳng dưới KPI vì đặt cạnh các khối doanh thu khác rất
 * dễ bị trừ nhầm vào doanh thu.
 */
export function CancellationPanel({ data, prev }: { data: CancellationData; prev: CancelSummary }) {
  const { summary, afterPrint, signature, actors, items, rows } = data;

  if (summary.cancelledQty === 0) {
    return <p className="text-sm text-steel">Kỳ này không có món nào bị hủy.</p>;
  }

  const ratePoints = cancelRateDeltaPoints(summary, prev);
  const approxNote = afterPrintNote(afterPrint);

  return (
    <div className="flex flex-col gap-lg">
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2 xl:grid-cols-4">
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
        {/* REPORT-11. Mốc in suy từ `print_jobs` (mốc SỚM NHẤT của đơn chứa món) — xem 0037. */}
        <KpiCard
          label="Hủy sau khi đã in phiếu bếp"
          value={`${afterPrint.afterQty} món`}
          hint={afterPrintHint(afterPrint, formatVnd)}
        />
      </div>

      <p className="text-xs text-steel">
        Đây là <strong className="font-medium text-ink">giá trị món bị hủy</strong>, không phải doanh thu
        mất — khách hủy món này thường gọi món khác thay thế.
      </p>

      {/* Nói rõ chỉ số mới ĐO cái gì, ngay dưới KPI. Người đọc rất dễ hiểu "hủy sau khi in" thành
          "hủy sai" — trong khi khách đổi ý sau lúc bếp đã làm là chuyện có thật hằng ngày. */}
      <p className="text-xs text-steel">
        <strong className="font-medium text-ink">Hủy sau khi đã in phiếu bếp</strong> đếm số món bị hủy
        muộn hơn lần in phiếu bếp đầu tiên của đơn chứa món đó — tức món nhiều khả năng đã xuống bếp.
        Con số này để xem xét, không tự nó nói lên điều gì: khách đổi ý sau khi món đã làm cũng rơi vào
        đây.
      </p>

      {approxNote && <p className="text-xs text-steel">{approxNote}</p>}

      {/* 0028 backfill `cancelled_at = created_at` cho dòng cũ (bảng order_items không có
          updated_at, không có mốc nào tốt hơn). Kỳ vắt qua ngày này trộn mốc xấp xỉ với mốc thật,
          kể cả delta "so kỳ trước" của tỷ lệ hủy — người đọc phải biết trước khi đi kết luận. */}
      <p className="text-xs text-steel">
        Số liệu hủy <strong className="font-medium text-ink">trước 16/08/2026</strong> là ước lượng: giờ
        hủy khi đó lấy theo giờ gọi món.
      </p>

      <SignatureBlock rows={signature} />

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
        <div>
          <h3 className="mb-sm text-sm font-medium text-ink">Theo người duyệt hủy</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-steel">
                  <th className="py-xs pr-md font-medium">Người duyệt</th>
                  <th className="py-xs pr-md text-right font-medium">Số món</th>
                  <th className="py-xs pr-md text-right font-medium">Giá trị</th>
                  {/* Cột chủ quán sẽ đọc: phần nào trong số món người này hủy là hủy sau khi in. */}
                  <th className="py-xs text-right font-medium">Sau khi in</th>
                </tr>
              </thead>
              <tbody>
                {actors.map((a) => {
                  const hasName = hasActorName(a.name);
                  return (
                    <tr key={a.membershipId ?? "unknown"} className="border-b border-hairline-soft">
                      <td className="py-sm pr-md text-ink">
                        {cancelActorLabel(a)}
                        {hasName && ROLE_LABEL[a.role] && (
                          <span className="ml-xs text-xs text-steel">({ROLE_LABEL[a.role]})</span>
                        )}
                      </td>
                      <td className="py-sm pr-md text-right tabular-nums text-ink">{a.qty}</td>
                      <td className="py-sm pr-md text-right tabular-nums text-ink">{formatVnd(a.amount)}</td>
                      {/* 0 món thì để chữ mờ: hàng số 0 dày đặc làm chìm mất dòng có số thật. */}
                      <td
                        className={
                          a.afterQty > 0
                            ? "py-sm text-right tabular-nums font-medium text-ink"
                            : "py-sm text-right tabular-nums text-steel"
                        }
                      >
                        {a.afterQty > 0 ? `${a.afterQty} · ${formatVnd(a.afterAmount)}` : "0"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-steel">
                <th className="py-xs pr-md font-medium">Lúc</th>
                <th className="py-xs pr-md font-medium">Đã in lúc</th>
                <th className="py-xs pr-md font-medium">Nơi</th>
                <th className="py-xs pr-md font-medium">Món</th>
                <th className="py-xs pr-md text-right font-medium">SL</th>
                <th className="py-xs pr-md text-right font-medium">Giá trị</th>
                <th className="py-xs pr-md font-medium">Lý do</th>
                <th className="py-xs font-medium">Người duyệt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const verdict = afterPrintVerdict(r);
                return (
                  <tr
                    key={`${r.cancelledAt}-${idx}`}
                    // Đánh dấu dòng hủy-sau-in bằng nền kem trung tính, KHÔNG dùng màu cảnh báo:
                    // đây là dòng cần đọc kỹ, không phải dòng đã bị kết luận.
                    className={
                      verdict === "after"
                        ? "border-b border-hairline-soft bg-cream-soft"
                        : "border-b border-hairline-soft"
                    }
                  >
                    <td className="py-sm pr-md whitespace-nowrap tabular-nums text-steel">
                      {vnStamp(r.cancelledAt)}
                    </td>
                    <td className="py-sm pr-md whitespace-nowrap tabular-nums text-steel">
                      {r.printedAt && verdict !== "unknown_time" ? (
                        <>
                          {vnStamp(r.printedAt)}
                          {verdict === "after" && (
                            <span className="ml-xs whitespace-nowrap rounded-sm bg-cream-deeper px-xxs text-xs font-medium text-ink">
                              hủy sau khi in
                            </span>
                          )}
                        </>
                      ) : (
                        VERDICT_EMPTY[verdict]
                      )}
                    </td>
                    <td className="py-sm pr-md whitespace-nowrap text-ink">{r.place}</td>
                    <td className="py-sm pr-md text-ink">{r.itemName}</td>
                    <td className="py-sm pr-md text-right tabular-nums text-ink">{r.qty}</td>
                    <td className="py-sm pr-md text-right tabular-nums text-ink">{formatVnd(r.amount)}</td>
                    <td className="py-sm pr-md text-steel">{r.reason}</td>
                    {/* Cùng một lượt hủy phải đọc ra CÙNG một chữ với danh sách "Theo người duyệt"
                        ở trên — `report_cancel_list` không trả `role` nên chỉ rơi được về "Không rõ". */}
                    <td className="py-sm whitespace-nowrap text-steel">
                      {cancelActorLabel({ name: r.actorName })}
                    </td>
                  </tr>
                );
              })}
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

/**
 * Đơn thỏa CẢ BA điều kiện: đã in phiếu bếp · hủy toàn bộ · chưa ghi nhận thanh toán (REPORT-11).
 * Đây là thứ chủ quán nhìn đầu tiên nên đặt ngay dưới KPI, có khung riêng.
 *
 * GIỌNG VĂN: mô tả SỰ KIỆN, không phán xét động cơ. Tiêu đề liệt kê đúng ba điều kiện thay vì đặt
 * cho nó một cái tên (mọi cái tên gọn đều nghe như một lời kết luận). Hiện CẢ HAI mốc giờ để người
 * đọc tự thấy thứ tự, kèm cảnh báo khi mốc chỉ là ước lượng.
 */
function SignatureBlock({ rows }: { rows: CancelSignatureRow[] }) {
  return (
    <div className="rounded-lg border border-hairline-strong bg-cream-soft p-md">
      <h3 className="text-sm font-medium text-ink">
        Đơn đã in phiếu bếp · hủy toàn bộ · chưa ghi nhận thanh toán
      </h3>
      <p className="mt-xxs text-xs text-steel">
        Đơn có phiếu bếp đã in, sau đó mọi món đều bị hủy, và không có khoản thu nào được ghi nhận cho
        đơn. Danh sách để xem lại từng đơn cụ thể — mỗi dòng đều có thể có lý do bình thường.
      </p>

      {rows.length === 0 ? (
        <p className="mt-sm text-sm text-steel">Kỳ này không có đơn nào như vậy.</p>
      ) : (
        <div className="mt-sm overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-steel">
                <th className="py-xs pr-md font-medium">Đã in lúc</th>
                <th className="py-xs pr-md font-medium">Hủy lúc</th>
                <th className="py-xs pr-md font-medium">Nơi</th>
                <th className="py-xs pr-md text-right font-medium">SL</th>
                <th className="py-xs pr-md text-right font-medium">Giá trị</th>
                <th className="py-xs pr-md font-medium">Lý do</th>
                <th className="py-xs font-medium">Người duyệt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId} className="border-b border-hairline-soft last:border-0">
                  <td className="py-sm pr-md whitespace-nowrap tabular-nums text-steel">
                    {r.printedAt ? vnStamp(r.printedAt) : "—"}
                  </td>
                  <td className="py-sm pr-md whitespace-nowrap tabular-nums text-steel">
                    {vnStamp(r.cancelledAt)}
                    {/* Mốc ước lượng của dữ liệu trước 0028: nói thẳng tại chỗ, vì đặt cạnh mốc in
                        thì người đọc mặc nhiên so hai cột với nhau. */}
                    {r.timeApprox && <span className="ml-xs text-xs text-steel">(ước lượng)</span>}
                  </td>
                  <td className="py-sm pr-md whitespace-nowrap text-ink">{r.place}</td>
                  <td className="py-sm pr-md text-right tabular-nums text-ink">{r.qty}</td>
                  <td className="py-sm pr-md text-right tabular-nums font-medium text-ink">
                    {formatVnd(r.amount)}
                  </td>
                  <td className="py-sm pr-md text-steel">{r.reason}</td>
                  <td className="py-sm whitespace-nowrap text-steel">
                    {cancelActorLabel({ name: r.actorName, role: r.actorRole })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
