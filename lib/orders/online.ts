/**
 * Đơn mang về/giao (ONLINE-01). Hai đường:
 *  - createOnlineOrder: KHÁCH ẩn danh (D15) → SERVICE ROLE, scope slug, luôn pending_confirm
 *    (bỏ qua qr_order_auto_send — QD-008 D-P5-5), table_session_id=null, source='online'.
 *  - list/accept/reject/markReady: phiên ADMIN (RLS cách ly tenant) + broadcast cho khách theo dõi.
 * Vòng đời (KDS chỉ để xem nên do /pos/online điều khiển):
 *    pending_confirm → confirmed (nhận đơn, +kitchen_no) → ready (sẵn sàng) → completed (thu tiền, 05-03).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  validateAndBuildLines,
  insertOrderGraph,
  nextKitchenNo,
  type CreateOrderResult,
} from "./create-order";
import { broadcastOrderStatus } from "./broadcast";
import type { OrderItemStatus, OrderStatus } from "./types";
import type { OrderLineInput } from "./types";

export type OnlineChannel = "takeaway" | "delivery";

export type CreateOnlineOrderInput = {
  slug: string;
  channel: OnlineChannel;
  lines: OrderLineInput[];
  customerName?: string;
  customerPhone?: string;
  address?: string;
  note?: string;
};

/**
 * Khách đặt món mang về/giao. name+phone bắt buộc; địa chỉ bắt buộc khi 'delivery'.
 * Không mở table_session. Đơn vào pending_confirm để nhân viên nhận.
 */
export async function createOnlineOrder(
  input: CreateOnlineOrderInput
): Promise<CreateOrderResult> {
  if (input.channel !== "takeaway" && input.channel !== "delivery")
    return { error: "Hình thức đặt món không hợp lệ." };

  const name = input.customerName?.trim();
  if (!name) return { error: "Vui lòng nhập tên để nhân viên liên hệ." };
  const phone = input.customerPhone?.trim();
  if (!phone) return { error: "Vui lòng nhập số điện thoại." };

  const address = input.address?.trim();
  if (input.channel === "delivery" && !address)
    return { error: "Vui lòng nhập địa chỉ giao hàng." };

  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;
  const customerContact: Record<string, unknown> = {
    name: name.slice(0, 50),
    phone: phone.slice(0, 20),
  };
  if (input.channel === "delivery") customerContact.address = address!.slice(0, 200);

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle();
  if (!tenant) return { error: "Không tìm thấy nhà hàng." };
  const tenantId = tenant.id as string;

  const validated = await validateAndBuildLines(admin, tenantId, input.lines);
  if ("error" in validated) return { error: validated.error };

  return insertOrderGraph(admin, {
    tenantId,
    sessionId: null,
    channel: input.channel,
    source: "online",
    status: "pending_confirm", // luôn qua duyệt (D-P5-5)
    confirmedAt: null,
    createdBy: null,
    confirmedBy: null,
    note,
    customerContact,
    built: validated.built,
  });
}

// ---- Admin: hàng đợi + điều khiển vòng đời ----------------------------------

export type OnlineOrderContact = { name?: string; phone?: string; address?: string };

export type OnlineOrderItem = {
  id: string;
  name: string;
  qty: number;
  note: string | null;
  status: OrderItemStatus;
  unitPrice: number;
  modifiers: string[];
};

export type OnlineOrderView = {
  id: string;
  channel: OnlineChannel;
  status: OrderStatus;
  kitchenNo: number | null;
  createdAt: string;
  note: string | null;
  contact: OnlineOrderContact;
  items: OnlineOrderItem[];
  total: number;
};

const ONLINE_ORDER_SELECT =
  "id, channel, status, kitchen_no, note, customer_contact, created_at, order_items(id, name_snapshot, unit_price_snapshot, qty, note, status, created_at, order_item_modifiers(name_snapshot))";

/** Map 1 row order (kèm items) → OnlineOrderView. */
function toOnlineOrderView(o: Record<string, unknown>): OnlineOrderView {
  const items: OnlineOrderItem[] = ((o.order_items as Record<string, unknown>[]) ?? [])
    .filter((it) => it.status !== "cancelled")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((it) => ({
      id: it.id as string,
      name: it.name_snapshot as string,
      qty: it.qty as number,
      note: (it.note as string) ?? null,
      status: it.status as OrderItemStatus,
      unitPrice: it.unit_price_snapshot as number,
      modifiers: ((it.order_item_modifiers as { name_snapshot: string }[]) ?? []).map((m) => m.name_snapshot),
    }));
  const total = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const contact = (o.customer_contact as OnlineOrderContact | null) ?? {};
  return {
    id: o.id as string,
    channel: o.channel as OnlineChannel,
    status: o.status as OrderStatus,
    kitchenNo: (o.kitchen_no as number) ?? null,
    createdAt: o.created_at as string,
    note: (o.note as string) ?? null,
    contact,
    items,
    total,
  };
}

/** Đơn online đang xử lý (pending_confirm/confirmed/ready). Phiên admin/POS RLS. */
export async function listOnlineOrders(tenantId: string): Promise<OnlineOrderView[]> {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select(ONLINE_ORDER_SELECT)
    .eq("tenant_id", tenantId)
    .in("channel", ["takeaway", "delivery"])
    .in("status", ["pending_confirm", "confirmed", "ready"])
    .order("created_at", { ascending: true });

  return (orders ?? []).map((o) => toOnlineOrderView(o as Record<string, unknown>));
}

/** Đơn MANG VỀ đang xử lý (confirmed/ready) — cho panel bán mang về trên POS. */
export async function listTakeawayOrders(tenantId: string): Promise<OnlineOrderView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(ONLINE_ORDER_SELECT)
    .eq("tenant_id", tenantId)
    .eq("channel", "takeaway")
    .in("status", ["confirmed", "ready"])
    .order("created_at", { ascending: true });
  return (data ?? []).map((o) => toOnlineOrderView(o as Record<string, unknown>));
}

/** Chi tiết 1 đơn online/takeaway theo id (mọi trạng thái). Phiên admin/POS RLS. */
export async function getOnlineOrder(tenantId: string, orderId: string): Promise<OnlineOrderView | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(ONLINE_ORDER_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .in("channel", ["takeaway", "delivery"])
    .maybeSingle();
  return data ? toOnlineOrderView(data as Record<string, unknown>) : null;
}

type MutateResult = { ok: true } | { error: string };

/** Nhận đơn: pending_confirm → confirmed (+ số bếp, mốc duyệt). Broadcast cho khách. */
export async function acceptOnlineOrder(
  tenantId: string,
  orderId: string,
  actorMembershipId: string
): Promise<MutateResult> {
  const supabase = await createClient();
  const kitchenNo = await nextKitchenNo(supabase, tenantId);
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: actorMembershipId,
      kitchen_no: kitchenNo,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .eq("status", "pending_confirm")
    .select("id")
    .maybeSingle();

  if (error) return { error: "Không nhận được đơn. Vui lòng thử lại." };
  if (!data) return { error: "Đơn đã được xử lý hoặc không tồn tại." };
  await broadcastOrderStatus(orderId);
  return { ok: true };
}

/** Từ chối đơn chờ: pending_confirm → cancelled (bắt buộc lý do). Broadcast cho khách. */
export async function rejectOnlineOrder(
  tenantId: string,
  orderId: string,
  reason: string
): Promise<MutateResult> {
  if (!reason?.trim()) return { error: "Vui lòng nhập lý do từ chối." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancel_reason: reason.trim().slice(0, 300),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .eq("status", "pending_confirm")
    .select("id")
    .maybeSingle();

  if (error) return { error: "Không từ chối được. Vui lòng thử lại." };
  if (!data) return { error: "Đơn đã được xử lý hoặc không tồn tại." };
  await broadcastOrderStatus(orderId);
  return { ok: true };
}

/** Đánh dấu sẵn sàng (bếp làm xong): confirmed → ready. Broadcast cho khách. */
export async function markOnlineReady(
  tenantId: string,
  orderId: string
): Promise<MutateResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "ready", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  if (error) return { error: "Không cập nhật được. Vui lòng thử lại." };
  if (!data) return { error: "Đơn chưa được nhận hoặc đã đổi trạng thái." };
  await broadcastOrderStatus(orderId);
  return { ok: true };
}
