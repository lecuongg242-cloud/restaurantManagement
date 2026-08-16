/**
 * Quyết định có được GỠ CHIA ĐỀU hay không (BILL-06). Thuần, không IO — `bill.ts` lo phần đọc/ghi,
 * giống cặp `planSplitByItems` ↔ `splitBillByItems`, `planCancelledBillCleanup` ↔
 * `dropCancelledItemsFromOpenBills`.
 *
 * Gỡ chia = XÓA các hóa đơn con. Đây là thao tác đụng tiền: `payments.bill_id` là
 * `on delete cascade` (0012_bills_core.sql), nên xóa một con ĐÃ THU là xóa luôn dòng tiền khách đã
 * trả — sổ sách hụt mà không để lại dấu vết. Vì vậy tầng này chặn cứng: chỉ cần MỘT con đã 'paid'
 * hoặc đã có payment (thu một phần, chưa đủ nên bill vẫn 'open') là từ chối cả lượt gỡ.
 * Muốn gỡ thì phải hoàn tiền phần đã thu trước — việc của người thật, không tự động hóa.
 */

export type SplitChild = {
  id: string;
  status: string;
  /** Số dòng `payments` của con này. > 0 = đã có tiền vào, kể cả khi bill còn 'open'. */
  paymentCount: number;
};

export type UnsplitPlan =
  | { ok: true; deleteChildIds: string[] }
  | { ok: false; error: string };

export function planUnsplit(children: SplitChild[]): UnsplitPlan {
  if (children.length === 0) return { ok: false, error: "Hóa đơn chưa chia." };

  const paid = children.some((c) => c.status === "paid" || c.paymentCount > 0);
  if (paid)
    return {
      ok: false,
      error: "Đã thu một phần — không gỡ chia được. Hoàn tiền phần đã thu trước.",
    };

  return { ok: true, deleteChildIds: children.map((c) => c.id) };
}
