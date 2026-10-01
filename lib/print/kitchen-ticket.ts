/**
 * Dựng nội dung phiếu bếp từ SNAPSHOT order_items (không join lại menu — giá/tên chốt lúc order).
 * Loại món đã hủy khỏi phiếu (PRINT-02). Chạy server (phiên RLS của nhân viên).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { KitchenTicketView } from "./adapter";
import { urlAnh } from "@/lib/storage/public-url";
import { kitchenTableName } from "@/lib/orders/place-label";
import { loadGroupRefs } from "@/lib/orders/table-group";

export async function buildKitchenTicket(
  orderId: string,
  tenantId: string
): Promise<KitchenTicketView | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, kitchen_no, confirmed_at, tenant_id, table_session_id, table_id, table_sessions(table_id, tables(name)), order_items(name_snapshot, qty, note, status, created_at, order_item_modifiers(name_snapshot))"
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!order) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, logo_url")
    .eq("id", tenantId)
    .maybeSingle();

  // Đã in lần nào cho order này chưa → nhãn IN LẠI.
  const { count } = await supabase
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("type", "kitchen_ticket")
    .contains("payload", { orderId });

  const ts = order.table_sessions as { table_id?: string; tables?: { name?: string } } | null;
  // Nhóm bàn (P23): "B3 (nhóm B1)" theo bàn gọi để phục vụ bưng đúng bàn. Đơn không bàn khỏi tra.
  const groupName = order.table_session_id
    ? kitchenTableName({
        sessionId: order.table_session_id as string,
        mainTableId: ts?.table_id ?? null,
        orderTableId: (order.table_id as string | null) ?? null,
        tables: await loadGroupRefs(supabase, tenantId),
      })
    : null;

  const items = ((order.order_items as Record<string, unknown>[]) ?? [])
    .filter((it) => it.status !== "cancelled")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((it) => ({
      name: it.name_snapshot as string,
      qty: it.qty as number,
      note: (it.note as string) ?? null,
      modifiers: ((it.order_item_modifiers as { name_snapshot: string }[]) ?? []).map(
        (m) => m.name_snapshot
      ),
    }));

  return {
    orderId: order.id,
    kitchenNo: (order.kitchen_no as number) ?? null,
    tenantName: tenant?.name ?? "",
    logoUrl: urlAnh(tenant?.logo_url),
    tableName: groupName ?? ts?.tables?.name ?? "—",
    confirmedAt: order.confirmed_at,
    ticketNo: order.id.slice(-6).toUpperCase(),
    isReprint: (count ?? 0) > 0,
    items,
  };
}
