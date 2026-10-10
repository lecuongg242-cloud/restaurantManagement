/**
 * Dựng nội dung phiếu bếp từ SNAPSHOT order_items (không join lại menu — giá/tên chốt lúc order).
 * Loại món đã hủy khỏi phiếu (PRINT-02). Chạy server (phiên RLS của nhân viên).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { CancelTicketView, KitchenTicketView } from "./adapter";
import { urlAnh } from "@/lib/storage/public-url";
import { kitchenTableName, orderPlaceLabel } from "@/lib/orders/place-label";
import { parseSettings } from "@/lib/tenant/settings";
import type { OrderChannel, OrderSource } from "@/lib/orders/types";
import { loadGroupRefs } from "@/lib/orders/table-group";
import { loadStations, splitByStation, targetOf } from "./stations";

type TicketItem = KitchenTicketView["items"][number] & { id: string; status: string; stationId: string | null };

/** Phần chung của phiếu bếp + phiếu hủy: thông tin đơn và MỌI món (kể cả đã hủy), kèm bếp/bar theo nhóm món. */
async function loadOrderForTicket(supabase: SupabaseClient, orderId: string, tenantId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, kitchen_no, confirmed_at, channel, source, eat_in, tenant_id, table_session_id, table_id, table_sessions(table_id, tables(name)), order_items(id, name_snapshot, qty, note, status, created_at, order_item_modifiers(name_snapshot), menu_items(menu_categories(station_id)))"
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

  const tableName = groupName ?? ts?.tables?.name ?? null;
  const place = tableName
    ? null
    : orderPlaceLabel({
        serviceMode: parseSettings(tenant?.settings).service_mode,
        channel: order.channel as OrderChannel,
        source: order.source as OrderSource,
        eatIn: order.eat_in as boolean,
      });

  const items: TicketItem[] = ((order.order_items as Record<string, unknown>[]) ?? [])
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((it) => {
      const mi = it.menu_items as { menu_categories?: { station_id?: string | null } | null } | null;
      return {
        id: it.id as string,
        status: it.status as string,
        stationId: mi?.menu_categories?.station_id ?? null,
        name: it.name_snapshot as string,
        qty: it.qty as number,
        note: (it.note as string) ?? null,
        modifiers: ((it.order_item_modifiers as { name_snapshot: string }[]) ?? []).map((m) => m.name_snapshot),
      };
    });

  return {
    orderId: order.id as string,
    kitchenNo: (order.kitchen_no as number) ?? null,
    tenantName: tenant?.name ?? "",
    logoUrl: urlAnh(tenant?.logo_url),
    tableName: tableName ?? place ?? "—",
    place,
    confirmedAt: order.confirmed_at as string | null,
    ticketNo: (order.id as string).slice(-6).toUpperCase(),
    items,
  };
}

const forTicket = ({ name, qty, note, modifiers }: TicketItem) => ({ name, qty, note, modifiers });

/** Đã in phiếu bếp lần nào cho order này chưa → nhãn IN LẠI. */
async function isReprint(supabase: SupabaseClient, orderId: string, tenantId: string): Promise<boolean> {
  const { count } = await supabase
    .from("print_jobs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("type", "kitchen_ticket")
    .contains("payload", { orderId });
  return (count ?? 0) > 0;
}

/** Phiếu bếp GỘP mọi món (in trình duyệt — một tờ trên máy in của thiết bị). */
export async function buildKitchenTicket(orderId: string, tenantId: string): Promise<KitchenTicketView | null> {
  const supabase = await createClient();
  const o = await loadOrderForTicket(supabase, orderId, tenantId);
  if (!o) return null;
  const { items, ...base } = o;
  return {
    ...base,
    isReprint: await isReprint(supabase, orderId, tenantId),
    items: items.filter((it) => it.status !== "cancelled").map(forTicket),
  };
}

/**
 * Phiếu bếp TÁCH theo bếp/bar cho cầu in (P37, PRINT-20): mỗi nơi có món một phiếu chỉ gồm món của nơi đó. Quán chỉ có
 * Bếp chính → đúng một phiếu, nội dung như `buildKitchenTicket` (không ghi tên nơi).
 */
export async function buildKitchenTickets(
  orderId: string,
  tenantId: string
): Promise<{ target: string; view: KitchenTicketView }[] | null> {
  const supabase = await createClient();
  const [o, stations, reprint] = await Promise.all([
    loadOrderForTicket(supabase, orderId, tenantId),
    loadStations(supabase, tenantId),
    isReprint(supabase, orderId, tenantId),
  ]);
  if (!o) return null;
  const { items, ...base } = o;
  const live = items.filter((it) => it.status !== "cancelled");
  const many = stations.length > 1;
  const groups = splitByStation(live, stations);
  // Đơn không còn món (hiếm): vẫn ra một phiếu Bếp chính rỗng như trước, để "In lại" không im lặng.
  if (groups.length === 0) groups.push({ station: stations[0], items: [] });
  return groups.map(({ station, items: its }) => ({
    target: targetOf(station),
    view: {
      ...base,
      isReprint: reprint,
      items: its.map(forTicket),
      stationName: many ? station.name : null,
      copies: station.copies,
      perItem: station.perItem,
    },
  }));
}

/**
 * Phiếu HỦY MÓN (P37, PRINT-23) cho các món vừa hủy, tách theo bếp/bar của món. `itemIds` rỗng → không phiếu nào.
 */
export async function buildCancelTickets(
  orderId: string,
  tenantId: string,
  itemIds: string[],
  info: { reason: string; cancelledBy: string | null; cancelledAt: string }
): Promise<{ target: string; view: CancelTicketView }[]> {
  if (itemIds.length === 0) return [];
  const supabase = await createClient();
  const [o, stations] = await Promise.all([
    loadOrderForTicket(supabase, orderId, tenantId),
    loadStations(supabase, tenantId),
  ]);
  if (!o) return [];
  const want = new Set(itemIds);
  const many = stations.length > 1;
  return splitByStation(
    o.items.filter((it) => want.has(it.id)),
    stations
  ).map(({ station, items }) => ({
    target: targetOf(station),
    view: {
      orderId: o.orderId,
      kitchenNo: o.kitchenNo,
      tableName: o.tableName,
      ticketNo: o.ticketNo,
      cancelledAt: info.cancelledAt,
      reason: info.reason,
      cancelledBy: info.cancelledBy,
      stationName: many ? station.name : null,
      copies: station.copies,
      items: items.map(forTicket),
    },
  }));
}
