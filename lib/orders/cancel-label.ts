/**
 * Dựng chuỗi mô tả một lượt hủy để hiện trên POS (ORDER-17). Thuần để test được — vitest không
 * parse .tsx (tsconfig để `jsx: preserve`), nên logic chữ nghĩa phải nằm ngoài component.
 *
 * Phần nào thiếu thì BỎ HẲN thay vì in "—": dòng này nằm ngay dưới tên món, mỗi ký tự thừa là
 * một lần nhân viên phải đọc lướt qua thứ không mang tin.
 *
 * `memberships.display_name` là cột NULLABLE — tra ra membership nhưng không có tên thì RƠI VỀ
 * VAI TRÒ thay vì bỏ hẳn: "Quản lý" vẫn giữ được thông tin quan trọng nhất cho việc giám sát (CÓ
 * người ở cấp đó duyệt), chỉ khi cả tên lẫn vai trò đều không có mới bỏ hẳn phần người duyệt.
 */

const VN_OFFSET = 7 * 3600 * 1000;

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Máy trạm",
};

export type CancelActor = { name: string; role: string };

/** "HH:MM" giờ VN. */
function vnTime(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET).toISOString().slice(11, 16);
}

export function formatCancelNote(input: {
  reason: string | null;
  at: string | null;
  actor: CancelActor | null;
}): string {
  const head = input.at ? `Đã hủy ${vnTime(input.at)}` : "Đã hủy";

  const parts: string[] = [head];
  const reason = input.reason?.trim();
  if (reason) parts.push(`"${reason}"`);
  if (input.actor) {
    const name = input.actor.name.trim();
    const role = ROLE_LABEL[input.actor.role];
    const actorPart = name && role ? `${name} (${role})` : name || role || null;
    if (actorPart) parts.push(actorPart);
  }
  return parts.join(" · ");
}

/**
 * Ghi chú hủy của MỘT MÓN có phải là bản lặp lại của ghi chú cấp ĐƠN không (đã hiện một lần ở
 * đầu thẻ)?
 *
 * Không thể lấy "đơn có lý do ⇒ đó là lý do chung" làm luật: roll-up trong `cancelOrderItem` tự
 * ghi `orders.cancel_reason = "Tất cả món bị hủy"` khi món cuối cùng bị hủy. Đơn 1 món — ca phổ
 * biến nhất — hủy phát là roll-up ngay, và luật kia sẽ giấu mất lý do THẬT nhân viên gõ cùng
 * người duyệt, tức đúng hai thứ ORDER-17 sinh ra để hiện.
 *
 * Lý do món rỗng cũng coi là lặp: không có gì thêm để nói, dòng thừa chỉ tốn chỗ.
 */
export function isSharedOrderCancelReason(
  itemReason: string | null,
  orderReason: string | null
): boolean {
  const order = orderReason?.trim() ?? "";
  if (!order) return false;
  const item = itemReason?.trim() ?? "";
  return item === "" || item === order;
}

/**
 * Người duyệt của một lượt hủy CẢ ĐƠN. `orders` không có cột `cancelled_by`, nhưng `cancelOrder`
 * ghi `cancelled_by` lên mọi món mà CHÍNH LƯỢT ĐÓ hủy — lấy từ đó ra.
 *
 * Phải khớp thêm MỐC THỜI GIAN, không được lấy món đầu tiên có `cancelled_by`: `cancelOrder` bỏ
 * qua món đã hủy từ trước (`.neq("status","cancelled")`), nên một đơn có món bị A hủy lẻ lúc
 * 19:00 rồi B hủy cả đơn lúc 20:15 sẽ đọc ra 'Đã hủy 20:15 · "lý do của B" · A' — gán nhầm tên
 * còn tệ hơn không gán tên ai, với đúng một tính năng sinh ra để quy trách nhiệm. Phép so khớp
 * này chặt vì `cancelOrder` ghi CÙNG một `now` cho cả `orders` lẫn `order_items`.
 *
 * Không món nào khớp mốc → null (không hiện người duyệt). Đây là ca của dữ liệu trước migration
 * 0028: `order_items.cancelled_at` khi đó backfill từ `created_at` nên không thể khớp
 * `orders.cancelled_at`. Thà bỏ trống còn hơn chỉ sai người.
 */
export function orderCancelActorId(
  items: { cancelledBy: string | null; cancelledAt: string | null }[],
  orderCancelledAt: string | null
): string | null {
  if (!orderCancelledAt) return null;
  return items.find((i) => i.cancelledBy && i.cancelledAt === orderCancelledAt)?.cancelledBy ?? null;
}
