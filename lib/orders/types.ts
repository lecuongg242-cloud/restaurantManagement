/**
 * Kiểu dữ liệu order (khớp cột DB migration 0008 §3.3–3.4). Giá integer VND.
 * Snapshot = chụp tên/giá lúc tạo order, không đổi khi menu sửa sau.
 */

export type OrderStatus =
  | "pending_confirm"
  | "confirmed"
  | "preparing"
  | "ready"
  | "served"
  | "completed"
  | "cancelled";

export type OrderItemStatus = "queued" | "preparing" | "ready" | "served" | "cancelled";

export type TableSession = {
  id: string;
  tenant_id: string;
  table_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
};

export type Order = {
  id: string;
  tenant_id: string;
  table_session_id: string | null;
  channel: "dine_in" | "takeaway" | "delivery";
  source: "qr" | "staff";
  status: OrderStatus;
  customer_contact: Record<string, unknown> | null;
  note: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  tenant_id: string;
  order_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  note: string | null;
  status: OrderItemStatus;
  cancel_reason: string | null;
  cancelled_by: string | null;
  prepared_at: string | null;
  created_at: string;
};

export type OrderItemModifier = {
  id: string;
  tenant_id: string;
  order_item_id: string;
  option_id: string | null;
  name_snapshot: string;
  price_delta_snapshot: number;
};

/**
 * CartLine — dòng giỏ phía CLIENT (state, chưa ghi DB). itemId + optionIds chọn.
 * lineId: khóa cục bộ để render/sửa/xóa (2 dòng cùng món khác tùy chọn vẫn tách).
 */
export type CartLine = {
  lineId: string;
  itemId: string;
  qty: number;
  note: string;
  optionIds: string[];
};

/** Payload gửi lên API tạo order (server tự re-validate, không tin client). */
export type OrderLineInput = {
  itemId: string;
  qty: number;
  note?: string;
  optionIds: string[];
};
