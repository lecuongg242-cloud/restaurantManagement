/**
 * Truy vấn KDS (03-03). Phiên RLS của nhân viên bếp/trạm (server client). Nguồn vé =
 * orders.status ∈ (confirmed, preparing, ready) + items chưa served/cancelled, gom theo order,
 * sort theo confirmed_at tăng dần. confirmed_at (0008) là mốc đo ≤3s (ORDER-04).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, OrderItemStatus } from "./types";

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
  confirmedAt: string | null;
  tableName: string;
  items: KdsItem[];
};

export async function getKdsTickets(tenantId: string): Promise<KdsTicket[]> {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, kitchen_no, status, confirmed_at, table_sessions(tables(name)), order_items(id, name_snapshot, qty, note, status, created_at, order_item_modifiers(name_snapshot))"
    )
    .eq("tenant_id", tenantId)
    .in("status", ["confirmed", "preparing", "ready"])
    .order("confirmed_at", { ascending: true });

  const tickets: KdsTicket[] = [];
  for (const o of orders ?? []) {
    // Chỉ món đang cần bếp (bỏ served/cancelled).
    const items: KdsItem[] = ((o.order_items as Record<string, unknown>[]) ?? [])
      .filter((it) => it.status !== "served" && it.status !== "cancelled")
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
    const ts = o.table_sessions as { tables?: { name?: string } } | null;
    const tableName = ts?.tables?.name ?? "—";

    tickets.push({
      orderId: o.id,
      kitchenNo: (o.kitchen_no as number) ?? null,
      status: o.status as OrderStatus,
      confirmedAt: o.confirmed_at,
      tableName,
      items,
    });
  }

  return tickets;
}
