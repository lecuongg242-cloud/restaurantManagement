/**
 * Broadcast trạng thái order cho KHÁCH ẨN DANH (quyết định P3 #1). postgres_changes đi
 * qua RLS → anon nhận 0 rows; Broadcast là pub/sub thuần (không qua RLS) nên khách
 * subscribe bằng anon key. Server đẩy message SAU mỗi lần đổi trạng thái (03-02/03/04 gọi).
 * Payload CHỈ gồm trạng thái order + snapshot món của ĐÚNG order đó — không dữ liệu tenant khác.
 * ORDER_CHANNEL dùng chung tên channel 2 phía (server gửi / client nhận).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus, OrderItemStatus } from "./types";

export function ORDER_CHANNEL(orderId: string): string {
  return `order:${orderId}`;
}

export type OrderStatusPayload = {
  status: OrderStatus;
  channel: "dine_in" | "takeaway" | "delivery";
  cancel_reason: string | null;
  items: { id: string; name: string; qty: number; status: OrderItemStatus }[];
};

/**
 * Đọc trạng thái hiện tại của order + items rồi phát broadcast event 'status'.
 * Gọi sau khi UPDATE thành công (duyệt/từ chối/bếp làm-xong/phục vụ/hủy).
 */
export async function broadcastOrderStatus(orderId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("status, channel, cancel_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;

  const { data: items } = await admin
    .from("order_items")
    .select("id, name_snapshot, qty, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  const payload: OrderStatusPayload = {
    status: order.status as OrderStatus,
    channel: order.channel as OrderStatusPayload["channel"],
    cancel_reason: order.cancel_reason,
    items: (items ?? []).map((i) => ({
      id: i.id,
      name: i.name_snapshot,
      qty: i.qty,
      status: i.status as OrderItemStatus,
    })),
  };

  const channel = admin.channel(ORDER_CHANNEL(orderId), {
    config: { broadcast: { ack: true } },
  });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 3000); // guard: không treo nếu WS chậm
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel
          .send({ type: "broadcast", event: "status", payload })
          .finally(() => {
            clearTimeout(timer);
            resolve();
          });
      }
    });
  });

  await admin.removeChannel(channel);
}
