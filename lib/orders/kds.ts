/**
 * Truy vấn KDS (03-03). Phiên RLS của nhân viên bếp/trạm (server client). Nguồn vé =
 * orders.status ∈ (confirmed, preparing, ready) + items chưa served/cancelled, chưa mang ra (QD-032), gom theo order,
 * sort theo confirmed_at tăng dần. confirmed_at (0008) là mốc đo ≤3s (ORDER-04).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { orderPlaceLabel, kitchenTableName, type GroupTableRef } from "./place-label";
import { loadGroupRefs } from "./table-group";
import type { OrderStatus, OrderItemStatus, OrderChannel, OrderSource } from "./types";

export type KdsItem = {
  id: string;
  name: string;
  qty: number;
  note: string | null;
  status: OrderItemStatus;
  modifiers: string[];
};

export type KdsTicket = {
  orderId: string;
  kitchenNo: number | null;
  status: OrderStatus;
  channel: OrderChannel;
  confirmedAt: string | null;
  tableName: string;
  /** Nhãn chỗ đã tính sẵn ("Bàn B1" / "Tại quán" / "Mang về" / "Giao tận nơi") — khớp phiếu in. */
  place: string;
  items: KdsItem[];
};

export async function getKdsTickets(tenantId: string): Promise<KdsTicket[]> {
  const supabase = await createClient();

  const [{ data: orders }, { data: tenant }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, kitchen_no, status, channel, source, confirmed_at, table_session_id, table_id, table_sessions(table_id, tables(name)), order_items(id, name_snapshot, qty, note, status, created_at, delivered_at, order_item_modifiers(name_snapshot))"
      )
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "preparing", "ready"])
      .order("confirmed_at", { ascending: true }),
    supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
  ]);
  const serviceMode = parseSettings(tenant?.settings).service_mode;
  // Nhóm bàn (P23): vé ghi "B3 (nhóm B1)" theo bàn gọi. Chỉ tra bàn khi có đơn gắn bàn.
  const groupRefs = (orders ?? []).some((o) => o.table_session_id)
    ? await loadGroupRefs(supabase, tenantId)
    : new Map<string, GroupTableRef>();

  const tickets: KdsTicket[] = [];
  for (const o of orders ?? []) {
    // Chỉ món đang cần bếp: bỏ served/cancelled và món phục vụ đã mang ra (P27 — vé rời bếp khi mang ra, QD-032).
    const items: KdsItem[] = ((o.order_items as Record<string, unknown>[]) ?? [])
      .filter((it) => it.status !== "served" && it.status !== "cancelled" && !it.delivered_at)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((it) => ({
        id: it.id as string,
        name: it.name_snapshot as string,
        qty: it.qty as number,
        note: (it.note as string) ?? null,
        status: it.status as OrderItemStatus,
        modifiers: ((it.order_item_modifiers as { name_snapshot: string }[]) ?? []).map(
          (m) => m.name_snapshot
        ),
      }));

    if (items.length === 0) continue; // order ready nhưng mọi món đã phục vụ → không hiện vé

    // table_sessions embed → tables(name)
    const ts = o.table_sessions as { table_id?: string; tables?: { name?: string } } | null;
    const groupName = o.table_session_id
      ? kitchenTableName({
          sessionId: o.table_session_id as string,
          mainTableId: ts?.table_id ?? null,
          orderTableId: (o.table_id as string | null) ?? null,
          tables: groupRefs,
        })
      : null;
    const tableName = groupName ?? ts?.tables?.name ?? "—";

    tickets.push({
      orderId: o.id,
      kitchenNo: (o.kitchen_no as number) ?? null,
      status: o.status as OrderStatus,
      channel: (o.channel as OrderChannel) ?? "dine_in",
      confirmedAt: o.confirmed_at,
      tableName,
      place: orderPlaceLabel({
        serviceMode,
        tableName: groupName ?? ts?.tables?.name ?? null,
        channel: (o.channel as OrderChannel) ?? "dine_in",
        source: o.source as OrderSource,
      }),
      items,
    });
  }

  return tickets;
}
