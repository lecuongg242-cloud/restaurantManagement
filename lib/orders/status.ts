/**
 * Máy trạng thái order + order_item (§3.4). Nguồn sự thật cho mọi transition —
 * dùng chung customer (03-01), POS (03-02/03-04), KDS (03-03). Server action
 * kiểm canTransition trước khi UPDATE (không tin client).
 */
import type { OrderStatus, OrderItemStatus } from "./types";

/** Chuyển hợp lệ ở mức ĐƠN (order). Hủy được từ bất kỳ trạng thái chưa kết thúc. */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending_confirm: ["confirmed", "cancelled"],
  confirmed: ["preparing", "served", "cancelled"],
  preparing: ["ready", "served", "cancelled"],
  ready: ["served", "cancelled"],
  served: ["completed"],
  completed: [],
  cancelled: [],
};

/** Chuyển hợp lệ ở mức MÓN (order_item). KDS chỉ đi queued→preparing→ready (D9). */
export const ITEM_FLOW: Record<OrderItemStatus, OrderItemStatus[]> = {
  queued: ["preparing", "ready", "served", "cancelled"],
  preparing: ["ready", "served", "cancelled"],
  // ready → queued: bếp bấm "Trả lại" khi bấm nhầm "Xong" (P27, QD-032).
  ready: ["queued", "served", "cancelled"],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_FLOW[from]?.includes(to) ?? false;
}

export function canTransitionItem(from: OrderItemStatus, to: OrderItemStatus): boolean {
  return ITEM_FLOW[from]?.includes(to) ?? false;
}

/**
 * Trạng thái ĐƠN tại bàn tính lại sau khi bếp bấm "Xong" / "Trả lại" (QD-032 D4). Bỏ món hủy. Mọi món còn lại đã xong (hoặc đã
 * thu) → `ready`; có món đang làm / đã xong → `preparing`; chưa món nào → `confirmed`. Không còn món nào → null (giữ nguyên).
 */
export function orderStatusFromItems(items: { status: string }[]): "confirmed" | "preparing" | "ready" | null {
  const live = items.filter((i) => i.status !== "cancelled");
  if (live.length === 0) return null;
  if (live.every((i) => i.status === "ready" || i.status === "served")) return "ready";
  if (live.some((i) => i.status === "preparing" || i.status === "ready" || i.status === "served")) return "preparing";
  return "confirmed";
}

/** Trạng thái kết thúc (khách dừng theo dõi realtime; không transition tiếp). */
export function isTerminalOrderStatus(s: OrderStatus): boolean {
  return s === "completed" || s === "cancelled";
}

/** Nhãn tiếng Việt cho stepper theo dõi (khách). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_confirm: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  preparing: "Đang làm",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

/**
 * Stepper khách CHỈ 2 bước: Chờ xác nhận → Đã xác nhận (QĐ 22/07). Khách chỉ cần biết đơn được
 * nhân viên nhận; các bước bếp/phục vụ là nội bộ (KDS read-only, phục vụ đánh ở POS).
 */
export const CUSTOMER_STEPPER: OrderStatus[] = ["pending_confirm", "confirmed"];

/** Nhãn thân thiện cho stepper khách. */
export const CUSTOMER_STEP_LABEL: Record<string, string> = {
  pending_confirm: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
};

/**
 * Stepper khách cho ĐƠN ONLINE (mang về/giao) — 4 bước tới hoàn tất (ONLINE-01). Khác dine-in vì
 * khách cần biết đã sẵn sàng để lấy/giao chưa (do /pos/online điều khiển, KDS chỉ để xem).
 */
export const ONLINE_STEPPER: OrderStatus[] = ["pending_confirm", "confirmed", "ready", "completed"];

export const ONLINE_STEP_LABEL: Record<string, string> = {
  pending_confirm: "Chờ xác nhận",
  confirmed: "Đang chuẩn bị",
  ready: "Sẵn sàng nhận/giao",
  completed: "Hoàn tất",
};

/** Chỉ số bước hiện tại trên ONLINE_STEPPER theo order.status. */
export function onlineStepIndex(status: OrderStatus): number {
  switch (status) {
    case "pending_confirm":
      return 0;
    case "confirmed":
    case "preparing":
      return 1;
    case "ready":
      return 2;
    case "served":
    case "completed":
      return 3;
    default:
      return 0; // cancelled xử lý riêng
  }
}
