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
