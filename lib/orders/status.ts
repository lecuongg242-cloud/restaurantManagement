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
  ready: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_FLOW[from]?.includes(to) ?? false;
}

export function canTransitionItem(from: OrderItemStatus, to: OrderItemStatus): boolean {
  return ITEM_FLOW[from]?.includes(to) ?? false;
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

/** Các bước hiển thị trên stepper khách (bỏ completed — đóng bill ở P4). */
export const CUSTOMER_STEPPER: OrderStatus[] = [
  "pending_confirm",
  "confirmed",
  "preparing",
  "ready",
  "served",
];
