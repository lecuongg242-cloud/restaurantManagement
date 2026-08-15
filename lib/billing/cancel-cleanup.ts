/**
 * Quyết định phải dọn gì khỏi hóa đơn ĐANG MỞ khi món bị hủy (BILL-06). Thuần, không IO —
 * `bill.ts` lo phần đọc/ghi, giống cặp `planSplitByItems` ↔ `splitBillByItems`.
 *
 * Vì sao chỉ đụng bill 'open': khi tách hóa đơn theo món, một `order_item` có thể có dòng ở
 * nhiều bill với `qty_allocated` khác nhau — phần đã 'paid' là tiền THẬT đã thu, xóa đi là làm
 * sai sổ. Bill 'paid' cũng không thể dính món đang hủy: thu đủ tiền thì `payBill` đánh dấu món
 * 'served', mà 'served' thì `cancelOrderItem` đã chặn từ đầu.
 */

export type OpenBillLine = { billItemId: string; billId: string; orderItemId: string };

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
  const deleteBillItemIds = input.cancelledLines.map((l) => l.billItemId);
  const dropped = new Set(deleteBillItemIds);
  const withPayments = new Set(input.billsWithPayments);

  // Thứ tự bill giữ theo lần xuất hiện đầu tiên → kế hoạch ổn định, test không phụ thuộc thứ tự Set.
  const touched: string[] = [];
  for (const l of input.cancelledLines) if (!touched.includes(l.billId)) touched.push(l.billId);

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
