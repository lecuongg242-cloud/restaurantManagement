/**
 * Truy vấn POS (03-02). Chạy dưới phiên RLS của nhân viên (server client) → tự cách ly tenant.
 * getPosSnapshot gom: khu vực + bàn (màu status), order chờ duyệt (drawer), và phiên bàn đang
 * mở kèm order/món (panel). Client (PosBoard) nhận initial rồi tự cập nhật qua realtime.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/observability/log";
import { listTakeawayOrders, type OnlineOrderView } from "./online";
import { getPendingCalls, type PosCall } from "./staff-calls";
import { kitchenTableName } from "./place-label";
import type { OrderStatus, OrderItemStatus } from "./types";

export type PosTable = {
  id: string;
  name: string;
  area_id: string | null;
  status: "available" | "occupied" | "reserved" | "cleaning";
  seats: number;
  /** Bàn PHỤ của một nhóm (P23): id phiên mà bàn được ghép vào. Bàn chính và bàn thường = null. */
  groupSessionId: string | null;
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
  /** Phục vụ đã bấm "Mang ra" (P27, QD-032) — khác 'served' (= đã thu tiền). */
  delivered: boolean;
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
  /** Bàn GỌI (P23). Null = đơn cũ / gọi từ bàn chính. */
  table_id: string | null;
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
  /** Bàn CHÍNH của phiên. */
  tableId: string;
  /** Bàn phụ đang ghép vào phiên (P23), theo thứ tự sơ đồ bàn. Rỗng = phiên một bàn như cũ. */
  memberTableIds: string[];
  opened_at: string;
  orders: PosOrder[];
  /** `splitCount != null` = hóa đơn đang chia đều → không hủy món được (BILL-06). */
  openBill: {
    id: string;
    bill_no: number | null;
    total: number;
    splitCount: number | null;
    created_at: string | null;
    /** order_item_id đã lên hóa đơn (open|paid) của phiên — món ngoài danh sách là khách gọi thêm sau "Tính tiền" (ORDER-26). */
    billedItemIds: string[];
  } | null;
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
 * thoại tại bàn (POS trên điện thoại) — vào thẳng `confirmed`, không đi qua hàng chờ duyệt, nên quầy không có
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
      delivered: !!r.delivered_at,
      created_at: r.created_at as string,
    }))
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
    .map(({ id, name, qty, note, status, unit_price, modifiers, cancel_reason, delivered }) => ({
      id,
      name,
      qty,
      note,
      status,
      unit_price,
      modifiers,
      cancel_reason,
      delivered,
    }));
}

const VN_OFFSET = 7 * 3600 * 1000;

export async function getPosSnapshot(tenantId: string, slug?: string): Promise<PosSnapshot> {
  return timed("getPosSnapshot", slug ?? null, () => readPosSnapshot(tenantId));
}

/** Thân thật của snapshot. Tách ra để `timed` bọc được mà không đổi chữ ký công khai (PERF-04). */
async function readPosSnapshot(tenantId: string): Promise<PosSnapshot> {
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
        .select("id, name, area_id, status, seats, sort_order, group_session_id")
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
          "id, kitchen_no, status, source, note, customer_contact, created_at, table_session_id, table_id, order_items(id, name_snapshot, unit_price_snapshot, qty, note, status, cancel_reason, created_at, delivered_at, order_item_modifiers(name_snapshot))"
        )
        .eq("tenant_id", tenantId)
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: true }),
      supabase
        .from("bills")
        .select("id, bill_no, total, table_session_id, split_count, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        // Phiên có thể có nhiều bill 'open' (tách bill, hoặc vỏ + con chia đều) mà panel chỉ hiện
        // được một → sắp cố định để lần mở nào cũng ra cùng hóa đơn, không tùy Postgres trả về.
        .order("created_at", { ascending: true }),
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

  // Nhãn bàn của đơn trong nhóm (P23): "B3 (nhóm B1)" theo bàn gọi — cùng hàm với phiếu bếp / màn bếp.
  const groupRefs = new Map(
    (tables ?? []).map((t) => [
      t.id as string,
      { id: t.id as string, name: t.name as string, group_session_id: (t.group_session_id as string | null) ?? null },
    ])
  );
  const orderTableName = (sessionId: string | null, orderTableId: string | null) => {
    const sess = sessionId ? sessionById.get(sessionId) : null;
    return kitchenTableName({
      sessionId,
      mainTableId: sess?.table_id ?? null,
      orderTableId,
      tables: groupRefs,
    });
  };
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
    created_at: string | null;
  };
  const openBillBySession = new Map<string, OpenBillRow>();
  for (const b of (openBills ?? []) as OpenBillRow[]) {
    if (b.table_session_id == null) continue;
    const prev = openBillBySession.get(b.table_session_id);
    if (prev == null || (b.split_count != null && prev.split_count == null))
      openBillBySession.set(b.table_session_id, b);
  }
  // Món đã lên hóa đơn của các phiên đang có hóa đơn mở — cùng quy tắc "đã phân bổ" với openBillForSession. Đọc hỏng thì
  // chỉ mất dấu "+N món gọi thêm" ở hàng chờ, không ảnh hưởng tiền (mở hóa đơn vẫn tự thêm món).
  const billedBySession = new Map<string, string[]>();
  if (openBillBySession.size > 0) {
    const { data: billed } = await supabase
      .from("bill_items")
      .select("order_item_id, bills!inner(table_session_id, status)")
      .eq("tenant_id", tenantId)
      .in("bills.table_session_id", [...openBillBySession.keys()])
      .in("bills.status", ["open", "paid"]);
    for (const r of (billed ?? []) as unknown as { order_item_id: string; bills: { table_session_id: string } }[]) {
      const arr = billedBySession.get(r.bills.table_session_id) ?? [];
      arr.push(r.order_item_id);
      billedBySession.set(r.bills.table_session_id, arr);
    }
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
    table_id: (o.table_id as string | null) ?? null,
    items: mapItems((o.order_items as unknown[]) ?? []),
  }));

  // Drawer: order chờ duyệt (pending_confirm).
  const pending: PosPending[] = allOrders
    .filter((o) => o.status === "pending_confirm")
    .map((o) => {
      const sess = o.table_session_id ? sessionById.get(o.table_session_id) : null;
      return {
        id: o.id,
        tableId: sess ? (o.table_id ?? sess.table_id) : null,
        tableName: orderTableName(o.table_session_id, o.table_id) ?? "—",
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
      return {
        id: o.id,
        kitchenNo: o.kitchen_no,
        tableId: sess ? (o.table_id ?? sess.table_id) : "",
        tableName: orderTableName(o.table_session_id, o.table_id) ?? "—",
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
      // `tables` đã sắp theo sort_order ⇒ bàn phụ ra đúng thứ tự sơ đồ.
      memberTableIds: (tables ?? []).filter((t) => t.group_session_id === s.id).map((t) => t.id as string),
      opened_at: s.opened_at,
      orders: ordersBySession.get(s.id) ?? [],
      openBill: b
        ? {
            id: b.id,
            bill_no: b.bill_no ?? null,
            total: b.total,
            splitCount: b.split_count ?? null,
            created_at: b.created_at ?? null,
            billedItemIds: billedBySession.get(s.id) ?? [],
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
      groupSessionId: (t.group_session_id as string | null) ?? null,
    })),
    pending,
    unprinted,
    sessions: posSessions,
    reservations,
    takeawayOrders,
    calls,
  };
}
