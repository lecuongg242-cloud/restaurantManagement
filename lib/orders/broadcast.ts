/**
 * Broadcast trạng thái order cho KHÁCH ẨN DANH (quyết định P3 #1). postgres_changes đi qua RLS →
 * anon nhận 0 rows; Broadcast là pub/sub thuần (không qua RLS) nên khách subscribe bằng anon key.
 * Payload CHỈ gồm trạng thái order + snapshot món của ĐÚNG order đó — không dữ liệu tenant khác.
 * `ORDER_CHANNEL` dùng chung tên channel 2 phía (server gửi / client nhận).
 *
 * PERF-01 — gửi bằng REST endpoint `/realtime/v1/api/broadcast`, KHÔNG mở WebSocket.
 *
 * Bản cũ tạo một kênh Realtime mới, `subscribe`, chờ `SUBSCRIBED` (guard timeout 3 giây), gửi, rồi
 * `removeChannel` — cho MỖI lần đổi trạng thái. Hai lối gọi lặp tuần tự (`pos/actions.ts`,
 * `lib/billing/bill.ts`) nên đóng một bill gộp 5 đơn tốn 1 giây trong điều kiện tốt, và tới 15 giây
 * khi bắt tay WebSocket chậm — đủ để phá cam kết BILL-04 "đóng bill ≤5s".
 *
 * Đo thật 24/09/2026: 5 đơn cách cũ **1.001ms**, REST một request **163ms**. Client không phải đổi
 * gì — vẫn `channel(ORDER_CHANNEL(id))`, vẫn event `status`, nhận sau ~281ms.
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

/** Chỉ đủ hình dạng để đọc order + items — cho phép test tiêm client giả, không gọi mạng thật. */
type OrderReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
        order: (
          column: string,
          opts?: { ascending?: boolean }
        ) => Promise<{ data: Record<string, unknown>[] | null }>;
      };
    };
  };
};

/** Đọc trạng thái hiện tại của một order. `null` nếu order không còn — bỏ qua, không phải lỗi. */
async function readPayload(
  client: OrderReader,
  orderId: string
): Promise<OrderStatusPayload | null> {
  const { data: order } = await client
    .from("orders")
    .select("status, channel, cancel_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await client
    .from("order_items")
    .select("id, name_snapshot, qty, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  return {
    status: order.status as OrderStatus,
    channel: order.channel as OrderStatusPayload["channel"],
    cancel_reason: (order.cancel_reason as string | null) ?? null,
    items: (items ?? []).map((i) => ({
      id: i.id as string,
      name: i.name_snapshot as string,
      qty: i.qty as number,
      status: i.status as OrderItemStatus,
    })),
  };
}

/**
 * Phát trạng thái cho NHIỀU đơn trong MỘT request.
 *
 * Đọc thì vẫn theo từng đơn (payload là snapshot của đúng đơn đó) nhưng chạy song song — gộp được
 * phần gửi mà vẫn để phần đọc nối tiếp thì chỉ đổi một nút cổ chai lấy một nút khác.
 *
 * KHÔNG ném ra ngoài: tới đây thì đơn đã đổi trạng thái trong DB rồi. Khách không nhận được thông
 * báo là phiền; làm hỏng cả thao tác của nhân viên vì một lỗi mạng phụ trợ thì tệ hơn nhiều.
 */
export async function broadcastOrderStatuses(
  orderIds: string[],
  client?: OrderReader
): Promise<void> {
  if (orderIds.length === 0) return;

  try {
    const reader = client ?? (createAdminClient() as unknown as OrderReader);
    const payloads = await Promise.all(orderIds.map((id) => readPayload(reader, id)));

    const messages = orderIds
      .map((id, i) => ({ id, payload: payloads[i] }))
      .filter((x): x is { id: string; payload: OrderStatusPayload } => x.payload !== null)
      .map((x) => ({ topic: ORDER_CHANNEL(x.id), event: "status", payload: x.payload }));

    if (messages.length === 0) return;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    // Endpoint trả 202, không phải 200 — kiểm `ok` chứ đừng so bằng 200.
    await fetch(`${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });
  } catch {
    // Nuốt có chủ đích — xem ghi chú ở đầu hàm.
  }
}

/** Phát trạng thái một đơn. Giữ nguyên chữ ký cũ để 9 lối gọi không phải sửa. */
export async function broadcastOrderStatus(orderId: string, client?: OrderReader): Promise<void> {
  return broadcastOrderStatuses([orderId], client);
}
