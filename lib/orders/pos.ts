/**
 * Truy vấn POS (03-02). Chạy dưới phiên RLS của nhân viên (server client) → tự cách ly tenant.
 * getPosSnapshot gom: khu vực + bàn (màu status), order chờ duyệt (drawer), và phiên bàn đang
 * mở kèm order/món (panel). Client (PosBoard) nhận initial rồi tự cập nhật qua realtime.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listTakeawayOrders, type OnlineOrderView } from "./online";
import { getPendingCalls, type PosCall } from "./staff-calls";
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
  /** `splitCount != null` = hóa đơn đang chia đều → không hủy món được (BILL-06). */
  openBill: { id: string; bill_no: number | null; total: number; splitCount: number | null } | null;
};

/** Đặt bàn hôm nay đã xác nhận + gán bàn — hiện trên thẻ bàn để nhân viên biết. */
export type PosReservation = {
  id: string;
  tableId: string;
  reservedAt: string;
  timeLabel: string; // HH:MM giờ VN
  customerName: string;
  partySize: number;
};

/**
 * Đơn đã xác nhận nhưng CHƯA in phiếu bếp lần nào (ORDER-16). Đơn nhân viên gõ — nhất là từ điện
 * thoại tại bàn (/pos/m) — vào thẳng `confirmed`, không đi qua hàng chờ duyệt, nên quầy không có
 * tín hiệu nào để biết phải in. Bếp không có màn KDS thì đơn quên in = món không bao giờ xuống bếp.
 */
export type PosUnprinted = {
  id: string;
  kitchenNo: number | null;
  tableId: string;
  tableName: string;
  created_at: string;
  itemCount: number;
};

export type PosSnapshot = {
  areas: PosArea[];
  tables: PosTable[];
  pending: PosPending[];
  unprinted: PosUnprinted[];
  sessions: PosSession[];
  reservations: PosReservation[];
  takeawayOrders: OnlineOrderView[];
  calls: PosCall[];
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

const VN_OFFSET = 7 * 3600 * 1000;

export async function getPosSnapshot(tenantId: string): Promise<PosSnapshot> {
  const supabase = await createClient();

  // Khoảng [đầu, cuối) NGÀY VN hôm nay (UTC) để lọc đặt bàn trong ngày.
  const dayStr = new Date(Date.now() + VN_OFFSET).toISOString().slice(0, 10);
  const dayStartUtc = new Date(Date.parse(`${dayStr}T00:00:00Z`) - VN_OFFSET).toISOString();
  const dayEndUtc = new Date(Date.parse(`${dayStr}T00:00:00Z`) - VN_OFFSET + 86400000).toISOString();

  const [{ data: areas }, { data: tables }, { data: sessions }, { data: orders }, { data: openBills }, { data: reservationRows }, { data: printJobs }, takeawayOrders, calls] =
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
        .select("id, bill_no, total, table_session_id, split_count")
        .eq("tenant_id", tenantId)
        .eq("status", "open"),
      supabase
        .from("reservations")
        .select("id, table_id, reserved_at, customer_name, party_size")
        .eq("tenant_id", tenantId)
        .eq("status", "confirmed")
        .not("table_id", "is", null)
        .gte("reserved_at", dayStartUtc)
        .lt("reserved_at", dayEndUtc)
        .order("reserved_at", { ascending: true }),
      // Phiếu bếp đã gửi đi trong ngày — để biết đơn nào CHƯA in (ORDER-16). Lấy cả job `pending`
      // (đã đẩy sang cầu in, không phải bấm lại); job `failed` do chip đỏ ở panel bàn lo.
      supabase
        .from("print_jobs")
        .select("payload")
        .eq("tenant_id", tenantId)
        .eq("type", "kitchen_ticket")
        .gte("created_at", dayStartUtc),
      listTakeawayOrders(tenantId),
      getPendingCalls(tenantId),
    ]);

  const tableById = new Map((tables ?? []).map((t) => [t.id, t]));
  const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
  // Một phiên đã chia đều có nhiều bill 'open' cùng lúc (vỏ + N con). Panel chỉ hiện được MỘT, và
  // phải là VỎ: nó mới mang `split_count` để biết bàn đang chia (khóa nút hủy món — BILL-06), còn
  // con chỉ là phần tiền. Không chọn tường minh thì rơi vào bill nào là tùy thứ tự Postgres trả về.
  type OpenBillRow = {
    id: string;
    bill_no: number | null;
    total: number;
    table_session_id: string | null;
    split_count: number | null;
  };
  const openBillBySession = new Map<string, OpenBillRow>();
  for (const b of (openBills ?? []) as OpenBillRow[]) {
    if (b.table_session_id == null) continue;
    const prev = openBillBySession.get(b.table_session_id);
    if (prev == null || (b.split_count != null && prev.split_count == null))
      openBillBySession.set(b.table_session_id, b);
  }

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

  // Banner: đơn CÓ BÀN đã xác nhận hôm nay mà chưa có phiếu bếp nào (ORDER-16). Chỉ lấy đúng
  // `confirmed` — bếp đã bấm nhận (preparing trở đi) thì món đã tới bếp bằng đường khác, nhắc
  // in nữa là nhiễu. Đơn KHÔNG bàn không vào đây: hàng đợi mang về/tại quầy vốn đã hiện thường
  // trực trên màn quầy kèm nút in riêng.
  const printedOrderIds = new Set(
    (printJobs ?? [])
      .map((j) => (j.payload as { orderId?: string } | null)?.orderId)
      .filter((id): id is string => !!id)
  );
  const dayStartMs = Date.parse(dayStartUtc);
  const unprinted: PosUnprinted[] = allOrders
    .filter(
      (o) =>
        o.status === "confirmed" &&
        !!o.table_session_id &&
        !printedOrderIds.has(o.id) &&
        Date.parse(o.created_at) >= dayStartMs
    )
    .map((o) => {
      const sess = sessionById.get(o.table_session_id as string);
      const tbl = sess ? tableById.get(sess.table_id) : null;
      return {
        id: o.id,
        kitchenNo: o.kitchen_no,
        tableId: sess?.table_id ?? "",
        tableName: tbl?.name ?? "—",
        created_at: o.created_at,
        itemCount: o.items
          .filter((i) => i.status !== "cancelled")
          .reduce((n, i) => n + i.qty, 0),
      };
    })
    // Phiên đã đóng mà đơn còn `confirmed` thì không còn bàn để bưng tới — bỏ, tránh chip "—".
    .filter((u) => !!u.tableId);

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
      openBill: b
        ? {
            id: b.id,
            bill_no: b.bill_no ?? null,
            total: b.total,
            splitCount: b.split_count ?? null,
          }
        : null,
    };
  });

  const reservations: PosReservation[] = (reservationRows ?? []).map((r) => ({
    id: r.id as string,
    tableId: r.table_id as string,
    reservedAt: r.reserved_at as string,
    timeLabel: new Date(new Date(r.reserved_at as string).getTime() + VN_OFFSET).toISOString().slice(11, 16),
    customerName: r.customer_name as string,
    partySize: r.party_size as number,
  }));

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
    unprinted,
    sessions: posSessions,
    reservations,
    takeawayOrders,
    calls,
  };
}
