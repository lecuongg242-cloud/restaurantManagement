/**
 * Quyết định phải dọn gì khỏi hóa đơn ĐANG MỞ khi món bị hủy (BILL-06). Thuần, không IO —
 * `bill.ts` lo phần đọc/ghi, giống cặp `planSplitByItems` ↔ `splitBillByItems`.
 *
 * Hai bất biến, tầng này sở hữu cả hai:
 *
 * 1. KHÔNG BAO GIỜ đụng bill khác 'open', chấm hết. Khi tách hóa đơn theo món, một `order_item`
 *    có thể có dòng ở nhiều bill với `qty_allocated` khác nhau; phần đã 'paid' là tiền THẬT đã
 *    thu, xóa đi là làm sai sổ.
 *
 * 2. KHÔNG đụng bill CHIA ĐỀU — cả "vỏ" (`splitCount != null`) lẫn con (`splitParentId != null`).
 *    `splitBillEvenly` để vỏ ở trạng thái 'open' và GIỮ NGUYÊN `bill_items`, nên vỏ lọt qua bộ
 *    lọc 'open' rất tự nhiên. Dọn dòng của vỏ thì cha ≠ Σ con (con mang `total` cố định, không
 *    tính lại theo dòng); tệ hơn, vỏ hết dòng sẽ bị xóa và `on delete cascade` kéo theo cả N con
 *    lẫn `payments` của chúng — tiền khách đã trả biến mất khỏi DB mà không để lại dấu vết.
 *    Mọi mutator khác trong `bill.ts` đều chặn đúng hai cờ này; hủy món phải theo cùng luật.
 *    Muốn hóa đơn chia đều giảm theo món hủy thì phải hủy chia trước — việc của người thật.
 */

export type OpenBillLine = {
  billItemId: string;
  billId: string;
  orderItemId: string;
  /** Vỏ chia đều khi != null (số phần đã chia). */
  splitCount: number | null;
  /** Con chia đều khi != null (id của vỏ). */
  splitParentId: string | null;
};

export type CancelCleanupInput = {
  /** Dòng `bill_items` thuộc bill 'open' của các order_item vừa hủy. */
  cancelledLines: OpenBillLine[];
  /** MỌI dòng hiện có của các bill bị chạm — để biết bill nào rỗng sau khi xóa. */
  billLines: { billItemId: string; billId: string }[];
  /** Bill đã có ít nhất 1 payment → không xóa dù rỗng (còn dấu vết tiền, để người thật xử lý). */
  billsWithPayments: string[];
};

export type CancelCleanupPlan = {
  deleteBillItemIds: string[];
  /** Bill còn dòng → tính lại tổng. Bill bị xóa KHÔNG nằm ở đây (tính lại rồi xóa là thừa). */
  recomputeBillIds: string[];
  deleteBillIds: string[];
};

export function planCancelledBillCleanup(input: CancelCleanupInput): CancelCleanupPlan {
  // Loại bill chia đều TRƯỚC khi dựng kế hoạch — xem bất biến 2 ở đầu file.
  const lines = input.cancelledLines.filter(
    (l) => l.splitCount == null && l.splitParentId == null
  );

  const deleteBillItemIds = lines.map((l) => l.billItemId);
  const dropped = new Set(deleteBillItemIds);
  const withPayments = new Set(input.billsWithPayments);

  // Thứ tự bill giữ theo lần xuất hiện đầu tiên → kế hoạch ổn định, test không phụ thuộc thứ tự Set.
  const touched: string[] = [];
  for (const l of lines) if (!touched.includes(l.billId)) touched.push(l.billId);

  const remaining = new Map<string, number>(touched.map((id) => [id, 0]));
  for (const l of input.billLines) {
    if (dropped.has(l.billItemId)) continue;
    if (remaining.has(l.billId)) remaining.set(l.billId, (remaining.get(l.billId) ?? 0) + 1);
  }

  const recomputeBillIds: string[] = [];
  const deleteBillIds: string[] = [];
  for (const billId of touched) {
    const isEmpty = (remaining.get(billId) ?? 0) === 0;
    if (isEmpty && !withPayments.has(billId)) deleteBillIds.push(billId);
    else recomputeBillIds.push(billId);
  }

  return { deleteBillItemIds, recomputeBillIds, deleteBillIds };
}
