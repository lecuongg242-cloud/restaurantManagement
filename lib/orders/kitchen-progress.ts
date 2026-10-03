import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderStatusFromItems } from "./status";

/**
 * Bếp báo xong / phục vụ "Mang ra" (P27 ORDER-04, QD-032). Bếp đổi status món queued|preparing ⇄ ready; phục vụ ghi
 * `delivered_at` (KHÔNG đụng 'served' — 'served' = đã thu tiền). Phiên RLS của nhân viên (server client).
 */
type Result = { ok: true; count: number } | { ok: false; error: string };

async function loadItems(supabase: SupabaseClient, tenantId: string, itemIds: string[]) {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, order_id, status, delivered_at")
    .eq("tenant_id", tenantId)
    .in("id", itemIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; order_id: string; status: string; delivered_at: string | null }[];
}

/**
 * Đơn TẠI BÀN: tính lại trạng thái đơn theo món (D4) — đơn `preparing` trở đi không còn bị nhắc "Cần in" (ORDER-16). Đơn
 * online / mang về giữ nguyên: "Sẵn sàng" của chúng do /pos/online điều khiển.
 */
async function syncTableOrders(supabase: SupabaseClient, tenantId: string, orderIds: string[]) {
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, table_session_id, order_items(status)")
    .eq("tenant_id", tenantId)
    .in("id", orderIds);
  for (const o of orders ?? []) {
    if (!o.table_session_id || !["confirmed", "preparing", "ready"].includes(o.status as string)) continue;
    const next = orderStatusFromItems((o.order_items as { status: string }[]) ?? []);
    if (next && next !== o.status)
      await supabase
        .from("orders")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", o.id)
        .eq("tenant_id", tenantId);
  }
}

/** "Xong" — món chưa xong, chưa mang ra → ready. */
export async function setItemsReady(supabase: SupabaseClient, tenantId: string, itemIds: string[]): Promise<Result> {
  const items = (await loadItems(supabase, tenantId, itemIds)).filter(
    (i) => (i.status === "queued" || i.status === "preparing") && !i.delivered_at
  );
  if (items.length === 0) return { ok: false, error: "Món đã xong hoặc không còn chờ làm." };
  const { error } = await supabase
    .from("order_items")
    .update({ status: "ready", prepared_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .in("id", items.map((i) => i.id));
  if (error) return { ok: false, error: error.message };
  await syncTableOrders(supabase, tenantId, [...new Set(items.map((i) => i.order_id))]);
  return { ok: true, count: items.length };
}

/** "Trả lại" — bếp bấm nhầm: ready (chưa mang ra) → queued. */
export async function undoItemReady(supabase: SupabaseClient, tenantId: string, itemId: string): Promise<Result> {
  const [item] = (await loadItems(supabase, tenantId, [itemId])).filter((i) => i.status === "ready" && !i.delivered_at);
  if (!item) return { ok: false, error: "Món đã mang ra hoặc không còn ở cột Đã xong." };
  const { error } = await supabase
    .from("order_items")
    .update({ status: "queued", prepared_at: null })
    .eq("tenant_id", tenantId)
    .eq("id", item.id);
  if (error) return { ok: false, error: error.message };
  await syncTableOrders(supabase, tenantId, [item.order_id]);
  return { ok: true, count: 1 };
}

/** "Mang ra" — món bếp đã xong → ghi delivered_at; món rời màn bếp. */
export async function setItemsDelivered(
  supabase: SupabaseClient,
  tenantId: string,
  itemIds: string[],
  staffId: string
): Promise<Result> {
  const items = (await loadItems(supabase, tenantId, itemIds)).filter((i) => i.status === "ready" && !i.delivered_at);
  if (items.length === 0) return { ok: false, error: "Món đã mang ra rồi." };
  const { error } = await supabase
    .from("order_items")
    .update({ delivered_at: new Date().toISOString(), delivered_by: staffId })
    .eq("tenant_id", tenantId)
    .in("id", items.map((i) => i.id));
  return error ? { ok: false, error: error.message } : { ok: true, count: items.length };
}
