/**
 * Truy vấn POS (03-02). Chạy dưới phiên RLS của nhân viên (server client) → tự cách ly tenant.
 * getPosSnapshot gom: khu vực + bàn (màu status), order chờ duyệt (drawer), và phiên bàn đang
 * mở kèm order/món (panel). Client (PosBoard) nhận initial rồi tự cập nhật qua realtime.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus, OrderItemStatus } from "./types";

export type PosTable = {
  id: string;
  name: string;
  area_id: string | null;
  status: "available" | "occupied" | "reserved" | "cleaning";
  seats: number;
};

export type PosArea = { id: string; name: string };

export type PosItem = {
  id: string;
  name: string;
  qty: number;
  note: string | null;
  status: OrderItemStatus;
  unit_price: number;
  modifiers: string[];
  cancel_reason: string | null;
};

export type CustomerContact = { name?: string; phone?: string | null } | null;

export type PosOrder = {
  id: string;
  kitchen_no: number | null;
  status: OrderStatus;
  source: "qr" | "staff";
  note: string | null;
  customer_contact: CustomerContact;
  created_at: string;
  table_session_id: string | null;
  items: PosItem[];
};

export type PosPending = {
  id: string;
  tableId: string | null;
  tableName: string;
  customer_contact: CustomerContact;
  created_at: string;
  items: PosItem[];
};

export type PosSession = {
  id: string;
  tableId: string;
  opened_at: string;
  orders: PosOrder[];
  openBill: { id: string; bill_no: number | null; total: number } | null;
};

export type PosSnapshot = {
  areas: PosArea[];
  tables: PosTable[];
  pending: PosPending[];
  sessions: PosSession[];
};

// Gồm 'served' để order đã phục vụ vẫn hiện trong panel tới khi ĐÓNG PHIÊN (mới cho đóng bill).
// Không gồm 'completed'/'cancelled' (đã kết thúc). pending_confirm lọc riêng cho drawer.
const ACTIVE_STATUSES = ["pending_confirm", "confirmed", "preparing", "ready", "served"];

function mapItems(rows: unknown[]): PosItem[] {
  return (rows as Record<string, unknown>[])
    .map((r) => ({
      id: r.id as string,
      name: r.name_snapshot as string,
      qty: r.qty as number,
      note: (r.note as string) ?? null,
      status: r.status as OrderItemStatus,
      unit_price: r.unit_price_snapshot as number,
      modifiers: ((r.order_item_modifiers as { name_snapshot: string }[]) ?? []).map(
        (m) => m.name_snapshot
      ),
      cancel_reason: (r.cancel_reason as string) ?? null,
      created_at: r.created_at as string,
    }))
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
    .map(({ id, name, qty, note, status, unit_price, modifiers, cancel_reason }) => ({
      id,
      name,
      qty,
      note,
      status,
      unit_price,
      modifiers,
      cancel_reason,
    }));
}

export async function getPosSnapshot(tenantId: string): Promise<PosSnapshot> {
  const supabase = await createClient();

  const [{ data: areas }, { data: tables }, { data: sessions }, { data: orders }, { data: openBills }] =
    await Promise.all([
      supabase
        .from("areas")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tables")
        .select("id, name, area_id, status, seats, sort_order")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("table_sessions")
        .select("id, table_id, opened_at")
        .eq("tenant_id", tenantId)
        .eq("status", "open"),
      supabase
        .from("orders")
        .select(
          "id, kitchen_no, status, source, note, customer_contact, created_at, table_session_id, order_items(id, name_snapshot, unit_price_snapshot, qty, note, status, cancel_reason, created_at, order_item_modifiers(name_snapshot))"
        )
        .eq("tenant_id", tenantId)
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: true }),
      supabase
        .from("bills")
        .select("id, bill_no, total, table_session_id")
        .eq("tenant_id", tenantId)
        .eq("status", "open"),
    ]);

  const tableById = new Map((tables ?? []).map((t) => [t.id, t]));
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  const openBillBySession = new Map(
    (openBills ?? [])
      .filter((b) => b.table_session_id != null)
      .map((b) => [b.table_session_id as string, b])
  );

  const allOrders: PosOrder[] = (orders ?? []).map((o) => ({
    id: o.id,
    kitchen_no: (o.kitchen_no as number) ?? null,
    status: o.status as OrderStatus,
    source: o.source as "qr" | "staff",
    note: o.note ?? null,
    customer_contact: (o.customer_contact as CustomerContact) ?? null,
    created_at: o.created_at,
    table_session_id: o.table_session_id,
    items: mapItems((o.order_items as unknown[]) ?? []),
  }));

  // Drawer: order chờ duyệt (pending_confirm).
  const pending: PosPending[] = allOrders
    .filter((o) => o.status === "pending_confirm")
    .map((o) => {
      const sess = o.table_session_id ? sessionById.get(o.table_session_id) : null;
      const tbl = sess ? tableById.get(sess.table_id) : null;
      return {
        id: o.id,
        tableId: sess?.table_id ?? null,
        tableName: tbl?.name ?? "—",
        customer_contact: o.customer_contact,
        created_at: o.created_at,
        items: o.items,
      };
    });

  // Panel: phiên mở + order đã confirmed trở đi (không gồm pending — pending ở drawer).
  const ordersBySession = new Map<string, PosOrder[]>();
  for (const o of allOrders) {
    if (o.status === "pending_confirm" || !o.table_session_id) continue;
    const arr = ordersBySession.get(o.table_session_id) ?? [];
    arr.push(o);
    ordersBySession.set(o.table_session_id, arr);
  }

  const posSessions: PosSession[] = (sessions ?? []).map((s) => {
    const b = openBillBySession.get(s.id);
    return {
      id: s.id,
      tableId: s.table_id,
      opened_at: s.opened_at,
      orders: ordersBySession.get(s.id) ?? [],
      openBill: b ? { id: b.id as string, bill_no: (b.bill_no as number) ?? null, total: b.total as number } : null,
    };
  });

  return {
    areas: (areas ?? []).map((a) => ({ id: a.id, name: a.name })),
    tables: (tables ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      area_id: t.area_id,
      status: t.status as PosTable["status"],
      seats: t.seats,
    })),
    pending,
    sessions: posSessions,
  };
}
