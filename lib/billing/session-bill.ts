/**
 * Chọn hóa đơn 'open' đại diện cho MỘT phiên bàn — THUẦN, không I/O (test ở
 * tests/billing/session-bill.test.ts), giống cặp `planUnsplit` ↔ `unsplitBill`.
 *
 * Vì sao cần chọn: một phiên có thể có NHIỀU bill 'open' cùng lúc —
 *  - chia đều: 1 "vỏ" (`split_count = N`, giữ `bill_items`) + N con (`split_parent_id` trỏ vỏ);
 *  - tách theo món/đơn: bill nguồn + bill tách, cả hai đều 'open' và không phải con.
 * Truy vấn `.maybeSingle()` gặp nhiều dòng thì trả lỗi chứ không trả bill — nuốt lỗi đó là biến
 * "bàn đã chia" thành "bàn chưa có bill" rồi tạo hóa đơn rỗng mới mỗi lần bấm xem.
 *
 * Quy tắc chọn (khớp `lib/orders/pos.ts` — panel POS chọn bill hiện cho từng bàn):
 *  1. Bỏ hóa đơn CON (`splitParentId != null`): con chỉ mang số tiền phần chia, không có món.
 *  2. Ưu tiên VỎ (`splitCount != null`): vỏ mới là hóa đơn mang món, và là chỗ duy nhất bấm được
 *     "Gỡ chia" — lối thoát BILL-06 cho bàn đã chia đều.
 *  3. Còn lại lấy bill tạo SỚM NHẤT, để lần mở nào cũng ra cùng hóa đơn (không tùy thứ tự DB trả).
 */

export type SessionOpenBill = {
  id: string;
  /** != null ⇒ đây là "vỏ" của một lượt chia đều. */
  splitCount: number | null;
  /** != null ⇒ đây là hóa đơn CON của một lượt chia đều. */
  splitParentId: string | null;
  /** ISO timestamp — dùng để chọn ổn định khi có nhiều ứng viên. */
  createdAt: string;
};

/** Một order của phiên bàn cùng danh sách món của nó (đã chuẩn hóa khỏi hình dạng PostgREST). */
export type SessionOrderForBill = {
  /** Trạng thái ORDER (không phải món): 'pending_confirm' = khách gửi, nhân viên CHƯA duyệt. */
  status: string;
  items: { id: string; unitPrice: number; qty: number; status: string }[];
};

export type BillableSessionItem = { id: string; unit: number; qty: number };

/**
 * Món của phiên bàn được phép lên hóa đơn — THUẦN, không I/O.
 *
 * Bỏ món đã hủy, và bỏ TOÀN BỘ món của order chưa duyệt / đã hủy. Món của đơn `pending_confirm`
 * mang `order_items.status = 'queued'` (mặc định DB — `insertOrderGraph` không set), nên nếu chỉ
 * lọc theo trạng thái MÓN thì chúng lọt vào hóa đơn y như món đã duyệt.
 *
 * VÌ SAO PHẢI CHẶN: đơn chưa duyệt là đơn nhân viên chưa chấp nhận — chưa có lý do gì để tính tiền.
 * Nghiêm trọng hơn, nó là đường vòng qua chốt "bàn đã chia đều": khách QR gọi thêm khi bàn đang
 * chia đều thì đơn nằm ở `pending_confirm` (chốt duyệt canh ở đó), nhưng chỉ cần thu ngân mở panel
 * hóa đơn là món ấy tự phân bổ vào VỎ, đội tổng vỏ lên trong khi các con vẫn mang số cũ ⇒ thu đủ
 * các con vẫn THIẾU đúng phần khách vừa gọi, mà món thì đã ra cho khách.
 */
export function collectBillableSessionItems(orders: SessionOrderForBill[]): BillableSessionItem[] {
  const out: BillableSessionItem[] = [];
  for (const o of orders) {
    if (o.status === "pending_confirm" || o.status === "cancelled") continue;
    for (const it of o.items) {
      if (it.status === "cancelled") continue;
      out.push({ id: it.id, unit: it.unitPrice, qty: it.qty });
    }
  }
  return out;
}

export function pickSessionOpenBill(bills: SessionOpenBill[]): string | null {
  // Không tin thứ tự đầu vào: sắp lại tại chỗ (id là chốt hòa cho trường hợp trùng createdAt).
  const candidates = bills
    .filter((b) => b.splitParentId == null)
    .slice()
    .sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1));
  if (candidates.length === 0) return null;

  const shell = candidates.find((b) => b.splitCount != null);
  return (shell ?? candidates[0]).id;
}
