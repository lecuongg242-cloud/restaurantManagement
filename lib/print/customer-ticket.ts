/**
 * Dựng phiếu KHÁCH từ SNAPSHOT order_items (giá/tên chốt lúc order, không join menu). Bỏ món
 * đã hủy. KHỚP kitchenNo với phiếu bếp để bếp mang món ra đúng khách. Chạy server (RLS nhân viên).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { orderPlaceLabel } from "@/lib/orders/place-label";
import type { OrderChannel, OrderSource } from "@/lib/orders/types";
import type { CustomerTicketView } from "./adapter";
import { urlAnh } from "@/lib/storage/public-url";

export async function buildCustomerTicket(
  orderId: string,
  tenantId: string
): Promise<CustomerTicketView | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, kitchen_no, created_at, channel, source, customer_contact, tenant_id, table_sessions(tables(name)), order_items(name_snapshot, unit_price_snapshot, qty, note, status, created_at, order_item_modifiers(name_snapshot))"
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!order) return null;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, logo_url, settings")
    .eq("id", tenantId)
    .maybeSingle();

  const ts = order.table_sessions as { tables?: { name?: string } } | null;
  const tableName = ts?.tables?.name ?? null;
  const place = orderPlaceLabel({
    serviceMode: parseSettings(tenant?.settings).service_mode,
    tableName,
    channel: order.channel as OrderChannel,
    source: order.source as OrderSource,
  });
  const contact = (order.customer_contact as { name?: string } | null) ?? null;

  const items = ((order.order_items as Record<string, unknown>[]) ?? [])
    .filter((it) => it.status !== "cancelled")
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((it) => ({
      name: it.name_snapshot as string,
      qty: it.qty as number,
      note: (it.note as string) ?? null,
      unitPrice: (it.unit_price_snapshot as number) ?? 0,
      modifiers: ((it.order_item_modifiers as { name_snapshot: string }[]) ?? []).map(
        (m) => m.name_snapshot
      ),
    }));

  const total = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);

  return {
    orderId: order.id,
    kitchenNo: (order.kitchen_no as number) ?? null,
    tenantName: tenant?.name ?? "",
    logoUrl: urlAnh(tenant?.logo_url),
    place,
    contactName: contact?.name ?? null,
    createdAt: order.created_at as string,
    ticketNo: order.id.slice(-6).toUpperCase(),
    items,
    total,
  };
}
