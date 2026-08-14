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
import type { BillStatus, PaymentMethod } from "@/lib/billing/types";
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
  /** Đơn gốc nếu đây là lượt "gọi thêm" (QD-011); null = đơn gốc. */
  parentOrderId: string | null;
};

const ONLINE_ORDER_SELECT =
  "id, channel, status, kitchen_no, note, customer_contact, created_at, parent_order_id, order_items(id, name_snapshot, unit_price_snapshot, qty, note, status, created_at, order_item_modifiers(name_snapshot))";

/**
 * Map 1 row order (kèm items) → OnlineOrderView.
 *
 * `keepCancelledItems`: giữ lại món đã hủy trong `items` (màn LỊCH SỬ cần đọc được đơn hủy — hủy
 * đơn thì hủy luôn từng món nên lọc đi là ra đơn rỗng). `total` luôn CHỈ cộng món chưa hủy = đúng
 * số tiền khách trả.
 */
function toOnlineOrderView(
  o: Record<string, unknown>,
  opts: { keepCancelledItems?: boolean } = {}
): OnlineOrderView {
  const items: OnlineOrderItem[] = ((o.order_items as Record<string, unknown>[]) ?? [])
    .filter((it) => opts.keepCancelledItems || it.status !== "cancelled")
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
  const total = items
    .filter((it) => it.status !== "cancelled")
    .reduce((s, it) => s + it.unitPrice * it.qty, 0);
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
    parentOrderId: (o.parent_order_id as string | null) ?? null,
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

// ---- Lịch sử đơn không gắn bàn (đã thu tiền / đã hủy) ------------------------

/** Tiền đã thu của MỘT nhóm đơn — bill luôn neo vào đơn gốc (`bills.online_order_id`). */
export type TakeawayBillInfo = {
  /** Đơn GỐC mà bill neo vào. */
  orderId: string;
  billId: string;
  billNo: number | null;
  status: BillStatus;
  total: number;
  paidAt: string | null;
  methods: PaymentMethod[];
};

/** Con số của CẢ khoảng lọc — không phải của trang đang xem. */
export type TakeawayHistorySummary = {
  /** Số NHÓM đơn khớp bộ lọc, đếm chính xác ở DB (không kéo dòng nào về). Theo ngày TẠO đơn. */
  orderCount: number;
  /**
   * Σ tiền THU trong kỳ — theo `bills.paid_at`, cùng gốc với trang Báo cáo (xem 0027).
   * KHÁC gốc với `orderCount` (ngày tạo đơn): đơn hôm qua chốt bù sáng nay tính vào hôm nay.
   */
  paidTotal: number;
  /** Số hóa đơn tạo nên `paidTotal` — để nhãn nói rõ đây là tiền thu, không phải tiền của N đơn. */
  paidBills: number;
};

export type TakeawayHistoryPage = {
  /** Đơn gốc + đơn con của TRANG này (chưa gom nhóm — gom ở client). */
  orders: OnlineOrderView[];
  bills: TakeawayBillInfo[];
  /** Con trỏ trang sau, dạng `createdAtISO|id` của đơn gốc cuối. null = đã hết. */
  nextCursor: string | null;
  /** Chỉ có ở trang ĐẦU; trang sau không tính lại cho đỡ tốn truy vấn. */
  summary: TakeawayHistorySummary | null;
  /**
   * Id các đơn TRONG TRANG NÀY khớp từ khóa — gồm cả lượt gọi thêm. Rỗng khi không tìm kiếm.
   *
   * Cần vì đơn vị hiển thị là NHÓM mang số của đơn GỐC: gõ "90" mà lượt gọi thêm #90 thuộc gốc
   * #87 thì màn hình hiện "Đơn #87" và trông y như kết quả sai. Có danh sách này, thẻ tự nói được
   * "khớp lượt #90".
   */
  matchedIds: string[];
};

const VN_OFFSET = 7 * 3600 * 1000;
/** Số NHÓM đơn mỗi trang. Nhỏ vì mỗi nhóm kéo theo cả cây món + tùy chọn. */
const HISTORY_PAGE = 20;
/** Trần số đơn khớp một lần tìm. Tìm ra hơn ngần này thì từ khóa quá rộng, không phải nhu cầu thật. */
const SEARCH_MATCH_CAP = 500;

/**
 * Chuỗi tìm kiếm đi THẲNG vào bộ lọc `or=(...)` của PostgREST, nơi `,()"*\` là ký tự CÚ PHÁP —
 * để lọt vào là vỡ truy vấn hoặc ghép được điều kiện ngoài ý muốn. Cắt luôn độ dài.
 */
function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[,()"*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** [đầu, cuối) UTC của khoảng NGÀY VN `fromDay..toDay` (YYYY-MM-DD, bao gồm cả hai đầu). */
export function vnDayRangeToUtc(fromDay: string, toDay: string): { fromUtc: string; toUtc: string } {
  const start = Date.parse(`${fromDay}T00:00:00Z`);
  const end = Date.parse(`${toDay}T00:00:00Z`) + 86400000;
  return {
    fromUtc: new Date(start - VN_OFFSET).toISOString(),
    toUtc: new Date(end - VN_OFFSET).toISOString(),
  };
}

/**
 * Đơn không gắn bàn ĐÃ KẾT THÚC (completed/cancelled) trong khoảng ngày VN — để nhân viên xem lại
 * đơn đã thu tiền. Hàng đợi POS chỉ giữ đơn confirmed/ready nên thu tiền xong là đơn rời màn hình;
 * đây là đường quay lại.
 *
 * Kèm `bills` (neo theo đơn gốc) để hiện SỐ TIỀN ĐÃ THU thật + in lại hóa đơn, thay vì cộng lại từ
 * món (bill có thể đã giảm giá / phụ thu). Số bếp reset mỗi ngày nên lọc theo ngày là bắt buộc để
 * đọc đúng "Đơn #5" là đơn nào.
 */
export async function listTakeawayHistory(
  tenantId: string,
  fromDay: string,
  toDay: string,
  opts: { cursor?: string | null; query?: string } = {}
): Promise<TakeawayHistoryPage> {
  const supabase = await createClient();
  const { fromUtc, toUtc } = vnDayRangeToUtc(fromDay, toDay);
  const q = sanitizeSearch(opts.query ?? "");
  const empty: TakeawayHistoryPage = {
    orders: [],
    bills: [],
    nextCursor: null,
    summary: { orderCount: 0, paidTotal: 0, paidBills: 0 },
    matchedIds: [],
  };

  // ---- 1. Tìm kiếm chạy Ở SERVER, trên CẢ khoảng ngày ----------------------
  // Trước đây lọc ở client trong tập đã tải nên đơn nằm ngoài trần bị báo "không thấy" dù có
  // thật. Khớp cả đơn CON (nhân viên nhớ số của lượt gọi thêm) rồi quy về đơn gốc, vì đơn vị
  // hiển thị là NHÓM.
  let searchRootIds: string[] | null = null;
  let matchedAll: Set<string> | null = null;
  if (q) {
    const ors = [
      `customer_contact->>name.ilike.*${q}*`,
      `customer_contact->>phone.ilike.*${q}*`,
    ];
    // Số đơn khớp CHÍNH XÁC: gõ "8" mà ra cả #18, #80, #89 thì danh sách vô dụng.
    if (/^\d+$/.test(q)) ors.unshift(`kitchen_no.eq.${q}`);

    const { data: hits } = await supabase
      .from("orders")
      .select("id, parent_order_id")
      .eq("tenant_id", tenantId)
      .eq("channel", "takeaway")
      .in("status", ["completed", "cancelled"])
      .gte("created_at", fromUtc)
      .lt("created_at", toUtc)
      .or(ors.join(","))
      .limit(SEARCH_MATCH_CAP);

    matchedAll = new Set((hits ?? []).map((r) => r.id as string));
    searchRootIds = [
      ...new Set(
        (hits ?? []).map((r) => (r.parent_order_id as string | null) ?? (r.id as string))
      ),
    ];
    if (searchRootIds.length === 0) return empty;
  }

  // ---- 2. Một TRANG đơn gốc (keyset: created_at desc, id desc) --------------
  // Phân trang theo ĐƠN GỐC chứ không theo đơn phẳng: cắt theo đơn phẳng sẽ xé đôi một nhóm
  // "gọi thêm" giữa hai trang, đọc ra đơn thiếu món.
  let rootQ = supabase
    .from("orders")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("channel", "takeaway")
    .in("status", ["completed", "cancelled"])
    .is("parent_order_id", null)
    .gte("created_at", fromUtc)
    .lt("created_at", toUtc)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_PAGE + 1);
  if (searchRootIds) rootQ = rootQ.in("id", searchRootIds);
  if (opts.cursor) {
    const sep = opts.cursor.lastIndexOf("|");
    const at = opts.cursor.slice(0, sep);
    const id = opts.cursor.slice(sep + 1);
    // Mốc kép để đơn TRÙNG created_at không bị nhảy cóc hay lặp lại giữa hai trang.
    rootQ = rootQ.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
  }
  const { data: rootRows } = await rootQ;

  const roots = rootRows ?? [];
  const hasMore = roots.length > HISTORY_PAGE;
  const pageRoots = hasMore ? roots.slice(0, HISTORY_PAGE) : roots;
  const rootIds = pageRoots.map((r) => r.id as string);
  const last = pageRoots[pageRoots.length - 1];
  // `toISOString()` (hậu tố Z) chứ không lấy nguyên chuỗi DB: dạng `+00:00` có dấu `+`, đi qua
  // query string sẽ bị giải mã thành DẤU CÁCH và mốc phân trang thành sai.
  const nextCursor =
    hasMore && last
      ? `${new Date(last.created_at as string).toISOString()}|${last.id as string}`
      : null;

  const summary = opts.cursor
    ? null
    : await takeawayHistorySummary(supabase, tenantId, fromUtc, toUtc, searchRootIds);

  if (rootIds.length === 0)
    return { orders: [], bills: [], nextCursor: null, summary, matchedIds: [] };

  // ---- 3. Cây đơn đầy đủ của đúng các gốc trong trang ------------------------
  const idList = rootIds.join(",");
  const { data: orderRows } = await supabase
    .from("orders")
    .select(ONLINE_ORDER_SELECT)
    .eq("tenant_id", tenantId)
    .or(`id.in.(${idList}),parent_order_id.in.(${idList})`)
    .order("created_at", { ascending: true });

  const orders = (orderRows ?? []).map((o) =>
    toOnlineOrderView(o as Record<string, unknown>, { keepCancelledItems: true })
  );

  const { data: billRows } = await supabase
    .from("bills")
    .select("id, bill_no, status, total, paid_at, online_order_id")
    .eq("tenant_id", tenantId)
    .in("online_order_id", rootIds);

  const billList = billRows ?? [];
  const { data: paymentRows } = billList.length
    ? await supabase
        .from("payments")
        .select("bill_id, method")
        .eq("tenant_id", tenantId)
        .in("bill_id", billList.map((b) => b.id as string))
    : { data: [] as { bill_id: string; method: string }[] };

  const methodsByBill = new Map<string, PaymentMethod[]>();
  for (const p of paymentRows ?? []) {
    const list = methodsByBill.get(p.bill_id as string) ?? [];
    const m = p.method as PaymentMethod;
    if (!list.includes(m)) list.push(m);
    methodsByBill.set(p.bill_id as string, list);
  }

  const bills: TakeawayBillInfo[] = billList.map((b) => ({
    orderId: b.online_order_id as string,
    billId: b.id as string,
    billNo: (b.bill_no as number) ?? null,
    status: b.status as BillStatus,
    total: b.total as number,
    paidAt: (b.paid_at as string) ?? null,
    methods: methodsByBill.get(b.id as string) ?? [],
  }));

  return {
    orders,
    bills,
    nextCursor,
    summary,
    matchedIds: matchedAll ? orders.filter((o) => matchedAll.has(o.id)).map((o) => o.id) : [],
  };
}

/**
 * Số đơn của danh sách + tiền THU của CẢ khoảng lọc (không phải của trang đang xem).
 *
 * Tiền đi qua RPC `takeaway_paid_total` (0027) vì hai lý do đã đo trên dữ liệu thật:
 *  - Gốc ngày: cộng theo `bills.paid_at` để KHỚP trang Báo cáo. Bản cũ neo theo ngày TẠO đơn nên
 *    đơn hôm trước chốt bù sáng hôm sau bị tính nhầm sang ngày cũ (14/08/2026: POS 13.585.000đ
 *    trong khi Báo cáo 18.350.000đ — lệch đúng 37 hóa đơn chốt bù).
 *  - Trần dòng: PostgREST chặn cứng 1000 dòng bất kể `.limit(5000)`, mà một tháng của quán đông
 *    khách đã hơn 1000 hóa đơn ⇒ cộng thiếu âm thầm. SUM chạy trong Postgres thì không có trần.
 *
 * `orderCount` vẫn đếm theo ngày TẠO đơn vì nó mô tả DANH SÁCH bên dưới — nhãn phải nói rõ hai
 * con số khác gốc, đừng ghép thành "N đơn thu được X".
 */
async function takeawayHistorySummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  fromUtc: string,
  toUtc: string,
  searchRootIds: string[] | null
): Promise<TakeawayHistorySummary> {
  let countQ = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("channel", "takeaway")
    .in("status", ["completed", "cancelled"])
    .is("parent_order_id", null)
    .gte("created_at", fromUtc)
    .lt("created_at", toUtc);
  if (searchRootIds) countQ = countQ.in("id", searchRootIds);

  const sumQ = supabase.rpc("takeaway_paid_total", {
    p_tenant: tenantId,
    p_from: fromUtc,
    p_to: toUtc,
    p_root_ids: searchRootIds,
  });

  const [{ count }, { data: totals, error: sumError }] = await Promise.all([countQ, sumQ]);

  // Lỗi RPC mà nuốt đi thì màn hình hiện "đã thu 0đ" — sai còn tệ hơn báo lỗi (xem lib/billing/reports.ts).
  if (sumError) throw new Error(`Lịch sử đơn: không cộng được tiền đã thu — ${sumError.message}`);

  const row = (totals as { paid_total: number; paid_bills: number }[] | null)?.[0];
  return {
    orderCount: count ?? 0,
    paidTotal: Number(row?.paid_total ?? 0),
    paidBills: Number(row?.paid_bills ?? 0),
  };
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
