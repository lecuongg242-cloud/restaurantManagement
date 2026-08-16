/**
 * Nghiệp vụ bill (P4 / 04-01). Chạy SERVER dưới phiên station RLS (createClient) — tự cách ly
 * tenant, KHÔNG service role (thao tác nội bộ nhân viên). Mở bill idempotent gom order_items của
 * phiên bàn; tính tổng bằng compute.ts (nguồn công thức duy nhất).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { computeBillTotals } from "./compute";
import { resolveReceivedAt } from "./received-at";
import { planSplitByItems, planSplitEvenly, type SplitPick, type SplitSourceLine } from "./split";
import { planCancelledBillCleanup } from "./cancel-cleanup";
import { parseUnsplitResult } from "./unsplit";
import {
  collectBillableSessionItems,
  hasUnapprovedSessionItems,
  pickSessionOpenBill,
  planSessionItemAllocation,
} from "./session-bill";
import { broadcastOrderStatus } from "@/lib/orders/broadcast";
import { groupOrderIds } from "@/lib/orders/order-group";
import type { BillView, BillLineView, DiscountType } from "./types";

/**
 * Số hóa đơn kế tiếp trong NGÀY (giờ VN, reset 00:00 VN) — giống nextKitchenNo. Race hiếm ở V1.
 */
export async function nextBillNo(client: SupabaseClient, tenantId: string): Promise<number> {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  const startUtc = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600 * 1000);
  const { data } = await client
    .from("bills")
    .select("bill_no")
    .eq("tenant_id", tenantId)
    .not("bill_no", "is", null)
    .gte("created_at", startUtc.toISOString());
  const max = (data ?? []).reduce((m, r) => Math.max(m, (r.bill_no as number) ?? 0), 0);
  return max + 1;
}

/** Tính lại 4 dòng tổng của bill từ bill_items hiện tại + cấu hình bill → UPDATE bills. */
async function recomputeBill(client: SupabaseClient, tenantId: string, billId: string): Promise<void> {
  const { data: bill } = await client
    .from("bills")
    .select("discount_type, discount_value, service_charge_pct, vat_pct")
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!bill) return;

  const { data: items } = await client
    .from("bill_items")
    .select("amount")
    .eq("bill_id", billId)
    .eq("tenant_id", tenantId);

  const totals = computeBillTotals({
    lines: (items ?? []).map((i) => ({ amount: i.amount as number })),
    discountType: bill.discount_type as DiscountType,
    discountValue: bill.discount_value as number,
    serviceChargePct: bill.service_charge_pct as number,
    vatPct: bill.vat_pct as number,
  });

  await client
    .from("bills")
    .update({
      subtotal: totals.subtotal,
      discount_amount: totals.discountAmount,
      service_charge_amount: totals.serviceChargeAmount,
      vat_amount: totals.vatAmount,
      total: totals.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", billId)
    .eq("tenant_id", tenantId);
}

/**
 * Trong `billIds`, những bill nào ĐANG CÓ hóa đơn con (kể cả con `void`)? Trả `null` khi không đọc
 * được — người gọi bắt buộc fail-closed.
 *
 * VÌ SAO PHẢI HỎI TRƯỚC KHI XÓA BILL: `bills.split_parent_id` là `on delete cascade` (0013) và
 * `payments.bill_id` cũng vậy (0012). Xóa một VỎ đã gỡ chia sẽ kéo theo toàn bộ con `void` của nó
 * — dấu vết lượt chia biến mất và `bill_no` đã cấp bị dùng lại. Đổi gỡ chia từ XÓA sang VOID (0031)
 * mới bịt được đường xóa CON; đường xóa VỎ vẫn hở nếu không kiểm ở đây.
 */
async function billIdsWithChildren(
  client: SupabaseClient,
  tenantId: string,
  billIds: string[]
): Promise<Set<string> | null> {
  if (billIds.length === 0) return new Set();
  const { data, error } = await client
    .from("bills")
    .select("split_parent_id")
    .eq("tenant_id", tenantId)
    .in("split_parent_id", billIds);
  if (error) return null;
  return new Set((data ?? []).map((r) => r.split_parent_id as string));
}

/**
 * Mở/đồng bộ bill của 1 phiên bàn — IDEMPOTENT. Gom order_item (≠cancelled) của các order ĐÃ DUYỆT
 * thuộc phiên CHƯA được phân bổ vào bill nào (open|paid) → thêm vào bill 'open' hiện có (hoặc tạo
 * mới). Gọi lại sau khi bàn gọi thêm món → chỉ thêm phần mới. Trả `billId`, hoặc `error` khi bàn
 * chưa có món tính tiền được / đọc hỏng (KHÔNG bao giờ trả null).
 *
 * HAI CHỐT GIỮ TIỀN, cả hai là hàm thuần có test trong `session-bill.ts`
 * (`collectBillableSessionItems`, `planSessionItemAllocation`):
 *  1. món của order chưa duyệt (`pending_confirm`) KHÔNG lên hóa đơn;
 *  2. bill được chọn là VỎ chia đều thì KHÔNG chèn thêm món vào nó.
 * Hàm này là đường ghi duy nhất mà panel POS gọi mỗi lần mở hóa đơn của bàn (kể cả chỉ để thu tiền
 * từng con), nên nó phải tự giữ bất biến Σ con = vỏ — không dựa vào chốt ở các action.
 */
export async function openBillForSession(
  tenantId: string,
  sessionId: string,
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();

  // Bàn có phiên hợp lệ + lấy order_items của phiên. Cần CẢ trạng thái order (lọc đơn chưa duyệt).
  const { data: orders, error: ordErr } = await client
    .from("orders")
    .select("id, status, order_items(id, unit_price_snapshot, qty, status)")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId);
  // Fail-closed: đọc hỏng thì DỪNG. Rơi xuống với danh sách rỗng là mở hóa đơn thiếu món.
  if (ordErr) return { error: "Không đọc được món của bàn. Vui lòng thử lại." };

  // Luật "món nào được tính tiền" nằm ở hàm thuần (có test) — đây chỉ chuẩn hóa hình dạng dữ liệu.
  const sessionOrders = (orders ?? []).map((o) => ({
    status: o.status as string,
    items: ((o.order_items as { id: string; unit_price_snapshot: number; qty: number; status: string }[]) ?? []).map(
      (it) => ({ id: it.id, unitPrice: it.unit_price_snapshot, qty: it.qty, status: it.status })
    ),
  }));
  const sessionItems = collectBillableSessionItems(sessionOrders);
  // Nói đúng nguyên nhân: bàn có món mà đơn chưa duyệt thì panel không mở, nhân viên lại đang nhìn
  // thấy món trên màn hình bàn — câu "chưa có món" ở ca đó làm họ tưởng hệ thống nuốt đơn. Bàn
  // trống thật vẫn giữ nguyên câu cũ.
  if (sessionItems.length === 0)
    return {
      error: hasUnapprovedSessionItems(sessionOrders)
        ? "Bàn chưa có món đã duyệt để tính tiền — duyệt đơn trước."
        : "Bàn chưa có món để tính tiền.",
    };

  // order_item_id đã phân bổ vào bill open|paid (của tenant) → không thêm lại.
  const { data: allocated, error: allocErr } = await client
    .from("bill_items")
    .select("order_item_id, bills!inner(status)")
    .eq("tenant_id", tenantId)
    .in("bills.status", ["open", "paid"]);
  // Fail-closed: đọc hỏng thì DỪNG. Rơi xuống với danh sách rỗng nghĩa là coi MỌI món của phiên là
  // CHƯA phân bổ ⇒ chèn lại toàn bộ vào bill đang mở. `bill_items` KHÔNG có unique
  // (bill_id, order_item_id) (0012) nên DB không chặn hộ ⇒ khách bị tính tiền hai lần. Lệch theo
  // hướng thu THỪA — đúng thứ tuyệt đối không được nuốt lỗi.
  if (allocErr) return { error: "Không kiểm được món đã lên hóa đơn. Vui lòng thử lại." };
  const allocatedItemIds = (allocated ?? []).map((r) => r.order_item_id as string);

  // Bill 'open' hiện có của phiên? Một phiên có thể có NHIỀU bill 'open' (vỏ + N con chia đều,
  // hoặc bill nguồn + bill tách) nên KHÔNG dùng `.maybeSingle()`: gặp nhiều dòng nó trả lỗi
  // PGRST116 chứ không trả bill, và nuốt lỗi đó thì hàm tưởng bàn chưa có hóa đơn → mỗi lần bấm
  // "Xem hóa đơn" lại đẻ thêm một bill rỗng. Con bị loại ngay ở DB; chọn giữa phần còn lại bằng
  // `pickSessionOpenBill` (thuần, có test) cho khớp cách panel POS chọn bill của bàn.
  const { data: openBills, error: openErr } = await client
    .from("bills")
    .select("id, split_count, split_parent_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId)
    .eq("status", "open")
    .is("split_parent_id", null)
    .order("created_at", { ascending: true });
  // Fail-closed: đọc hỏng thì báo lỗi, TUYỆT ĐỐI không rơi xuống nhánh tạo bill mới (đó chính là
  // đường sinh rác dữ liệu trước đây).
  if (openErr) return { error: "Không đọc được hóa đơn của bàn. Vui lòng thử lại." };

  const sessionBills = (openBills ?? []).map((b) => ({
    id: b.id as string,
    splitCount: b.split_count as number | null,
    splitParentId: b.split_parent_id as string | null,
    createdAt: b.created_at as string,
  }));
  const existingBillId = pickSessionOpenBill(sessionBills);

  let billId: string;
  if (existingBillId) {
    billId = existingBillId;
  } else {
    const settings = await getSessionSettings(client, tenantId);
    const billNo = await nextBillNo(client, tenantId);
    const { data: created, error } = await client
      .from("bills")
      .insert({
        tenant_id: tenantId,
        bill_no: billNo,
        table_session_id: sessionId,
        status: "open",
        service_charge_pct: settings.service_charge_pct,
        vat_pct: settings.vat_pct,
        created_by: actorMembershipId,
      })
      .select("id")
      .single();
    if (error || !created) return { error: "Không mở được hóa đơn. Vui lòng thử lại." };
    billId = created.id as string;
  }

  // CHỐT 2: quyết định "chèn dòng nào" nằm ở hàm THUẦN `planSessionItemAllocation` (có test — vỏ
  // chia đều ⇒ rỗng). Ở đây chỉ ghi. `billId` có thể là bill vừa tạo, không nằm trong
  // `sessionBills` — hàm thuần hiểu đúng ca đó (bill mới không thể là vỏ).
  //
  // BỎ QUA IM LẶNG, KHÔNG trả lỗi: hàm này chạy mỗi lần thu ngân MỞ panel hóa đơn — thao tác đọc,
  // và là thao tác bắt buộc để bấm "Thu tiền" cho từng con. Fail cứng ở đây sẽ chặn luôn việc thu
  // tiền hợp lệ của một bàn đang chia đều, tức biến một chốt bảo vệ thành cái khóa bàn.
  //
  // Món bị bỏ qua KHÔNG mất: nó nằm nguyên ở `order_items`, chưa phân bổ vào bill nào. Chuỗi thao
  // tác thật để nó lên hóa đơn là "Gỡ chia" → DUYỆT ĐƠN → mở lại panel (lối thoát BILL-06). Đủ ba
  // bước, không rút gọn được — đừng nghĩ riêng nút "Gỡ chia" là xong:
  //  - `unsplitBill` bỏ cờ vỏ, nhưng `recomputeBill` của nó chỉ tính lại tổng TỪ `bill_items` sẵn
  //    có, KHÔNG BAO GIỜ thêm dòng mới;
  //  - ca chính rơi vào đây là món của đơn `pending_confirm` (khách QR gọi thêm khi bàn đang chia),
  //    mà chốt 1 — `collectBillableSessionItems` — vẫn loại nó cho tới khi nhân viên duyệt đơn;
  //  - chèn thật sự chỉ xảy ra ở LẦN MỞ BILL KẾ TIẾP, tức chính đoạn dưới đây.
  const toInsert = planSessionItemAllocation({
    billableItems: sessionItems,
    allocatedItemIds,
    openBills: sessionBills,
    targetBillId: billId,
  });
  if (toInsert.length > 0) {
    const rows = toInsert.map((i) => ({
      tenant_id: tenantId,
      bill_id: billId,
      order_item_id: i.id,
      qty_allocated: i.qty,
      unit_price_snapshot: i.unit,
      amount: i.unit * i.qty,
    }));
    const { error: biErr } = await client.from("bill_items").insert(rows);
    if (biErr) return { error: "Không thêm được món vào hóa đơn. Vui lòng thử lại." };
  }

  await recomputeBill(client, tenantId, billId);
  return { billId };
}

/**
 * Mở/đồng bộ bill cho một NHÓM đơn không gắn bàn (mang về/giao) — P5/05-03, mở rộng ở QD-011.
 *
 * Bill neo vào ĐƠN GỐC (`online_order_id = rootId`) và gom `order_items` (≠cancelled) của **gốc
 * + mọi lượt gọi thêm**. Gọi vào bằng id của bất kỳ đơn nào trong nhóm đều ra cùng một bill.
 *
 * Idempotent nhưng KHÔNG "trả bill cũ rồi thôi": nếu bill đang `open` mà nhóm phát sinh món mới
 * (khách gọi thêm sau khi nhân viên đã bấm "Thu tiền" một lần), hàm **đồng bộ lại** — thêm
 * bill_items còn thiếu, bỏ bill_items của món đã hủy, rồi tính lại tổng. Không có bước này thì
 * hóa đơn thiếu đúng phần khách vừa gọi. Bill `paid` thì giữ nguyên (đã chốt sổ).
 *
 * KHÔNG tách/gộp/chia đều — thứ đó chỉ dine-in có. %phí/%VAT lấy từ settings lúc MỞ bill.
 */
export async function openBillForOrder(
  tenantId: string,
  orderId: string,
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();

  const { data: order } = await client
    .from("orders")
    .select("id, channel, parent_order_id")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { error: "Không tìm thấy đơn." };
  if (order.channel === "dine_in") return { error: "Đơn tại bàn dùng luồng POS." };

  // Bill luôn neo vào gốc — bấm thu tiền ở đơn con cũng ra bill của cả nhóm.
  const rootId = (order.parent_order_id as string | null) ?? (order.id as string);
  const orderIds = await groupOrderIds(client, tenantId, rootId);

  const { data: ois } = await client
    .from("order_items")
    .select("id, unit_price_snapshot, qty, status")
    .eq("tenant_id", tenantId)
    .in("order_id", orderIds);
  const items = (ois ?? []).filter((i) => i.status !== "cancelled");

  const { data: existing } = await client
    .from("bills")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("online_order_id", rootId)
    .in("status", ["open", "paid"])
    .maybeSingle();

  if (existing) {
    const billId = existing.id as string;
    if (existing.status === "paid") return { billId };
    const sync = await syncGroupBillItems(client, tenantId, billId, items);
    if (sync) return { error: sync };
    await recomputeBill(client, tenantId, billId);
    return { billId };
  }

  if (items.length === 0) return { error: "Đơn chưa có món để tính tiền." };

  const settings = await getSessionSettings(client, tenantId);
  const billNo = await nextBillNo(client, tenantId);
  const { data: created, error } = await client
    .from("bills")
    .insert({
      tenant_id: tenantId,
      bill_no: billNo,
      table_session_id: null,
      online_order_id: rootId,
      status: "open",
      service_charge_pct: settings.service_charge_pct,
      vat_pct: settings.vat_pct,
      created_by: actorMembershipId,
    })
    .select("id")
    .single();
  if (error || !created) return { error: "Không mở được hóa đơn. Vui lòng thử lại." };
  const billId = created.id as string;

  const sync = await syncGroupBillItems(client, tenantId, billId, items);
  if (sync) return { error: sync };

  await recomputeBill(client, tenantId, billId);
  return { billId };
}

/**
 * Đưa bill_items của một bill nhóm về khớp đúng danh sách `items` hiện tại: thêm món mới, xóa
 * món đã bị hủy khỏi bill. Trả chuỗi lỗi nếu hỏng, `null` nếu xong.
 * (Đơn không bàn không tách bill nên mỗi order_item có tối đa 1 dòng bill_items — so sánh theo
 * tập id là đủ, không cần đối chiếu qty_allocated.)
 */
async function syncGroupBillItems(
  client: SupabaseClient,
  tenantId: string,
  billId: string,
  items: { id: unknown; unit_price_snapshot: unknown; qty: unknown }[]
): Promise<string | null> {
  const { data: current } = await client
    .from("bill_items")
    .select("id, order_item_id")
    .eq("tenant_id", tenantId)
    .eq("bill_id", billId);

  const have = new Set((current ?? []).map((r) => r.order_item_id as string));
  const want = new Set(items.map((i) => i.id as string));

  const toAdd = items.filter((i) => !have.has(i.id as string));
  if (toAdd.length > 0) {
    const rows = toAdd.map((i) => ({
      tenant_id: tenantId,
      bill_id: billId,
      order_item_id: i.id as string,
      qty_allocated: i.qty as number,
      unit_price_snapshot: i.unit_price_snapshot as number,
      amount: (i.unit_price_snapshot as number) * (i.qty as number),
    }));
    const { error } = await client.from("bill_items").insert(rows);
    if (error) return "Không thêm được món vào hóa đơn. Vui lòng thử lại.";
  }

  const toDrop = (current ?? [])
    .filter((r) => !want.has(r.order_item_id as string))
    .map((r) => r.id as string);
  if (toDrop.length > 0) {
    const { error } = await client
      .from("bill_items")
      .delete()
      .in("id", toDrop)
      .eq("tenant_id", tenantId);
    if (error) return "Không cập nhật được hóa đơn. Vui lòng thử lại.";
  }

  return null;
}

/**
 * Đóng phiên bàn nếu MỌI order_item (≠cancelled) của phiên đã nằm trong hóa đơn 'paid' (TABLE-02
 * phần còn — tự đóng khi thanh toán xong). Bàn về 'available'. Không đóng nếu còn món chưa thu.
 */
/** Σ qty_allocated đã 'paid' cho từng order_item (biết món thu đủ chưa — chịu cả tách theo món). */
async function paidQtyMap(
  client: SupabaseClient,
  tenantId: string,
  orderItemIds: string[]
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (orderItemIds.length === 0) return m;
  const { data } = await client
    .from("bill_items")
    .select("order_item_id, qty_allocated, bills!inner(status)")
    .eq("tenant_id", tenantId)
    .in("order_item_id", orderItemIds)
    .eq("bills.status", "paid");
  for (const r of data ?? [])
    m.set(r.order_item_id as string, (m.get(r.order_item_id as string) ?? 0) + (r.qty_allocated as number));
  return m;
}

async function closeSessionIfSettled(client: SupabaseClient, tenantId: string, sessionId: string): Promise<void> {
  const { data: sess } = await client
    .from("table_sessions")
    .select("id, table_id, status")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!sess || sess.status !== "open") return;

  const { data: orders } = await client
    .from("orders")
    .select("id, order_items(status)")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId);
  // Món 'served' = đã thu đủ (payBill đánh dấu). Còn món chưa 'served' (chưa thu) → không đóng.
  const statuses: string[] = [];
  for (const o of orders ?? [])
    for (const it of (o.order_items as { status: string }[]) ?? [])
      if (it.status !== "cancelled") statuses.push(it.status);
  if (statuses.length === 0) return; // không còn món tính tiền → để đóng thủ công
  if (!statuses.every((s) => s === "served")) return;

  const now = new Date().toISOString();
  await client.from("table_sessions").update({ status: "closed", closed_at: now }).eq("id", sessionId).eq("tenant_id", tenantId);
  await client.from("tables").update({ status: "available" }).eq("id", sess.table_id).eq("tenant_id", tenantId);
}

/**
 * Thu tiền + đóng bill (04-04, BILL-04). Thu đủ `total` (tiền mặt/chuyển khoản — chỉ ghi nhận, QD
 * D-P4-1). Con chia đều thu riêng; khi mọi con paid → cha paid. Sau paid: tự đóng phiên bàn đã
 * thanh toán hết (TABLE-02). Trả tiền thối (mặt).
 */
export async function payBill(
  tenantId: string,
  billId: string,
  input: {
    method: "cash" | "transfer";
    amountReceived: number;
    note?: string | null;
    /** Mốc tiền THỰC SỰ về, khi khác thời điểm bấm nút (thu bù). Bỏ trống = bây giờ. */
    receivedAt?: string | null;
  },
  actorMembershipId: string | null,
  opts: { canBackdate?: boolean } = {}
): Promise<{ ok: true; change: number } | { error: string }> {
  const client = await createClient();
  const { data: bill } = await client
    .from("bills")
    .select("id, status, total, table_session_id, online_order_id, split_count, split_parent_id")
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!bill) return { error: "Không tìm thấy hóa đơn." };
  if (bill.status !== "open") return { error: "Hóa đơn đã đóng." };
  if (bill.split_count != null) return { error: "Hóa đơn đã chia — thu ở từng phần con." };
  const total = bill.total as number;
  if (total <= 0) return { error: "Hóa đơn chưa có tiền để thu." };

  const now = new Date().toISOString();
  // `paidAt` = lúc TIỀN VỀ (nguồn sự thật của báo cáo); `now` = lúc BẤM NÚT, giữ ở `updated_at`
  // để vẫn truy được ai thu bù lúc nào.
  const received = resolveReceivedAt(input.receivedAt, opts.canBackdate === true);
  if ("error" in received) return { error: received.error };
  const paidAt = received.at;

  const { error: pErr } = await client.from("payments").insert({
    tenant_id: tenantId,
    bill_id: billId,
    method: input.method,
    amount: total,
    received_at: paidAt,
    received_by: actorMembershipId,
    note: input.note?.trim() ? input.note.trim().slice(0, 200) : null,
  });
  if (pErr) return { error: "Ghi nhận thanh toán thất bại. Vui lòng thử lại." };

  // `.eq("status","open")` là chốt chống ĐUA với gỡ chia đều: nếu RPC `unsplit_bill_evenly` (0031)
  // giành khóa trước và void con này, lệnh dưới KHÔNG được lật nó ngược về 'paid'. Con void hóa
  // 'paid' sẽ vào thẳng doanh thu (report_summary lọc `status='paid' and split_count is null`)
  // trong khi vỏ đã trở lại hóa đơn thường và sẽ được thu TOÀN BỘ lần nữa ⇒ thu trùng của khách,
  // lại xóa luôn dấu vết void.
  const { data: closed, error: closeErr } = await client
    .from("bills")
    .update({ status: "paid", paid_at: paidAt, closed_by: actorMembershipId, updated_at: now })
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .select("id");
  // 0 dòng = hóa đơn đã đổi trạng thái giữa chừng. `payments` đã ghi rồi nên KHÔNG im lặng đi tiếp:
  // dừng lại để người thật đối soát khoản vừa nhận, thay vì tự động chốt sổ trên một hóa đơn khác
  // với thứ thu ngân đang nhìn.
  if (closeErr || (closed ?? []).length === 0)
    return {
      error:
        "Hóa đơn vừa đổi trạng thái (có thể vừa bị gỡ chia). Khoản tiền đã được ghi nhận — vui lòng đối soát với quản lý trước khi thu lại.",
    };

  // Con chia đều: mọi con paid → cha paid.
  // Bỏ con 'void' (tàn dư của một lượt chia ĐÃ GỠ, vẫn giữ `split_parent_id` — 0031) khỏi phép
  // kiểm: sau chuỗi chia → gỡ → chia lại, tập con là [void cũ…, paid mới…] nên `every(paid)` không
  // bao giờ đúng, vỏ mãi 'open', món không lên 'served' và phiên bàn kẹt "đang phục vụ" vĩnh viễn.
  // KÈM kiểm tập KHÔNG RỖNG: `[].every(...)` trả true, sẽ đánh 'paid' cho vỏ không có con nào.
  const parentId = (bill.split_parent_id as string) ?? null;
  if (parentId) {
    const { data: sib, error: sibErr } = await client
      .from("bills")
      .select("status")
      .eq("tenant_id", tenantId)
      .eq("split_parent_id", parentId)
      .neq("status", "void");
    // Đọc hỏng thì KHÔNG chốt vỏ: để vỏ 'open' chỉ làm chậm việc đóng phiên (thu lại lần nữa là
    // xong), còn chốt nhầm là mất dấu phần chưa thu.
    // `paid_at` của vỏ lấy `paidAt` (mốc TIỀN VỀ của con cuối cùng), không lấy `now` (mốc bấm nút)
    // — cùng một gốc thời gian với con, để vỏ và con không kể hai câu chuyện khác nhau khi thu bù.
    if (!sibErr && (sib?.length ?? 0) > 0 && (sib ?? []).every((s) => s.status === "paid"))
      await client.from("bills").update({ status: "paid", paid_at: paidAt, updated_at: now }).eq("id", parentId).eq("tenant_id", tenantId);
  }

  // Đánh dấu món ĐÃ THU ĐỦ = 'served' (rời KDS — "vé tự xóa khi thanh toán") + gom phiên để đóng.
  // bill giữ món = cha nếu là con chia đều, else bill này.
  const sessions = new Set<string>();
  if (bill.table_session_id) sessions.add(bill.table_session_id as string);
  const holderId = parentId ?? billId;
  const { data: hItems } = await client
    .from("bill_items")
    .select("order_item_id")
    .eq("bill_id", holderId)
    .eq("tenant_id", tenantId);
  const holderOiIds = [...new Set((hItems ?? []).map((r) => r.order_item_id as string))];
  if (holderOiIds.length > 0) {
    const { data: oiRows } = await client
      .from("order_items")
      .select("id, order_id, qty, status")
      .in("id", holderOiIds)
      .eq("tenant_id", tenantId);
    const paidQty = await paidQtyMap(client, tenantId, holderOiIds);
    const nowServed = (oiRows ?? []).filter(
      (r) =>
        r.status !== "served" &&
        r.status !== "cancelled" &&
        (paidQty.get(r.id as string) ?? 0) >= (r.qty as number)
    );
    if (nowServed.length > 0) {
      await client
        .from("order_items")
        .update({ status: "served" })
        .in("id", nowServed.map((r) => r.id as string))
        .eq("tenant_id", tenantId);
      // Roll-up order → served khi mọi món của order đã served/cancelled (rời KDS cả vé).
      for (const oid of [...new Set(nowServed.map((r) => r.order_id as string))]) {
        const { data: sib } = await client
          .from("order_items")
          .select("status")
          .eq("order_id", oid)
          .eq("tenant_id", tenantId);
        if ((sib ?? []).every((s) => s.status === "served" || s.status === "cancelled"))
          await client.from("orders").update({ status: "served", updated_at: now }).eq("id", oid).eq("tenant_id", tenantId);
      }
    }
    // Phiên bàn của các món (kể cả gộp nhiều bàn).
    const orderIds = [...new Set((oiRows ?? []).map((r) => r.order_id as string))];
    if (orderIds.length > 0) {
      const { data: ords } = await client.from("orders").select("table_session_id").in("id", orderIds).eq("tenant_id", tenantId);
      for (const o of ords ?? []) if (o.table_session_id) sessions.add(o.table_session_id as string);
    }
  }
  for (const s of sessions) await closeSessionIfSettled(client, tenantId, s);

  // Đơn không gắn bàn: thu đủ = HOÀN TẤT. Roll-up ở trên đã đặt món 'served'; ở đây nâng đơn lên
  // 'completed' (trạng thái cuối cho theo dõi khách) + broadcast.
  // Nâng CẢ NHÓM gọi thêm (QD-011 §4), không chỉ đơn neo bill — nếu không, các lượt gọi thêm
  // kẹt ở 'served' và không bao giờ rời hàng đợi POS dù khách đã trả tiền.
  if (bill.online_order_id) {
    const rootId = bill.online_order_id as string;
    const groupIds = await groupOrderIds(client, tenantId, rootId);
    await client
      .from("orders")
      .update({ status: "completed", updated_at: now })
      .in("id", groupIds)
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled");
    for (const oid of groupIds) await broadcastOrderStatus(oid);
  }

  const change = Math.max(0, Math.round(input.amountReceived) - total);
  return { ok: true, change };
}

/** Đọc cấu hình phí/VAT từ tenants.settings (default lúc mở bill). */
async function getSessionSettings(client: SupabaseClient, tenantId: string) {
  const { data } = await client.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  return parseSettings(data?.settings);
}

/** Gói dữ liệu 1 bill cho POS panel / in hóa đơn. */
export async function getBillView(tenantId: string, billId: string): Promise<BillView | null> {
  const client = await createClient();

  const { data: bill } = await client
    .from("bills")
    .select(
      "id, bill_no, table_session_id, status, subtotal, discount_type, discount_value, discount_amount, service_charge_pct, service_charge_amount, vat_pct, vat_amount, total, note, paid_at, split_count, split_parent_id"
    )
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!bill) return null;

  const { data: billItems } = await client
    .from("bill_items")
    .select(
      "id, order_item_id, qty_allocated, unit_price_snapshot, amount, order_items(name_snapshot, note, order_id, orders(kitchen_no), order_item_modifiers(name_snapshot))"
    )
    .eq("bill_id", billId)
    .eq("tenant_id", tenantId);

  const lines: BillLineView[] = (billItems ?? []).map((bi) => {
    const oi = bi.order_items as {
      name_snapshot?: string;
      note?: string | null;
      order_id?: string;
      orders?: { kitchen_no?: number } | null;
      order_item_modifiers?: { name_snapshot: string }[];
    } | null;
    return {
      billItemId: bi.id as string,
      orderItemId: bi.order_item_id as string,
      orderId: oi?.order_id ?? "",
      orderKitchenNo: oi?.orders?.kitchen_no ?? null,
      name: oi?.name_snapshot ?? "—",
      qty: bi.qty_allocated as number,
      unitPrice: bi.unit_price_snapshot as number,
      amount: bi.amount as number,
      modifiers: (oi?.order_item_modifiers ?? []).map((m) => m.name_snapshot),
      note: oi?.note ?? null,
    };
  });

  const { data: payments } = await client
    .from("payments")
    .select("id, bill_id, method, amount, received_at, note")
    .eq("bill_id", billId)
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: true });

  return {
    id: bill.id as string,
    billNo: (bill.bill_no as number) ?? null,
    status: bill.status as BillView["status"],
    tableSessionId: (bill.table_session_id as string) ?? null,
    discountType: bill.discount_type as DiscountType,
    discountValue: bill.discount_value as number,
    serviceChargePct: bill.service_charge_pct as number,
    vatPct: bill.vat_pct as number,
    note: (bill.note as string) ?? null,
    paidAt: (bill.paid_at as string) ?? null,
    splitCount: (bill.split_count as number) ?? null,
    splitParentId: (bill.split_parent_id as string) ?? null,
    lines,
    totals: {
      subtotal: bill.subtotal as number,
      discountAmount: bill.discount_amount as number,
      serviceChargeAmount: bill.service_charge_amount as number,
      vatAmount: bill.vat_amount as number,
      total: bill.total as number,
    },
    payments: (payments ?? []).map((p) => ({
      id: p.id as string,
      bill_id: p.bill_id as string,
      method: p.method as "cash" | "transfer",
      amount: p.amount as number,
      received_at: p.received_at as string,
      note: (p.note as string) ?? null,
    })),
  };
}

/**
 * Mọi bill "sống" (open/paid, gồm cả vỏ chia đều + con) liên quan phiên bàn — cho panel liệt kê.
 * Gồm: bill có table_session_id = phiên, HOẶC bill (gộp) chứa order_item của phiên. Bỏ 'void'.
 */
export async function getSessionBills(tenantId: string, sessionId: string): Promise<BillView[]> {
  const client = await createClient();

  // A: bill trực thuộc phiên (gồm vỏ chia đều + hóa đơn con vì con giữ table_session_id của cha).
  const { data: ownBills } = await client
    .from("bills")
    .select("id, split_parent_id")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId)
    .neq("status", "void");
  const ids = new Set((ownBills ?? []).map((b) => b.id as string));

  // B: bill gộp (table_session_id=null) chứa order_item của phiên này.
  const { data: orders } = await client
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId);
  const orderIds = (orders ?? []).map((o) => o.id as string);
  if (orderIds.length > 0) {
    const { data: ois } = await client
      .from("order_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("order_id", orderIds);
    const oiIds = (ois ?? []).map((r) => r.id as string);
    if (oiIds.length > 0) {
      const { data: bItems } = await client
        .from("bill_items")
        .select("bill_id, bills!inner(status)")
        .eq("tenant_id", tenantId)
        .in("order_item_id", oiIds)
        .neq("bills.status", "void");
      for (const r of bItems ?? []) ids.add(r.bill_id as string);
    }
  }

  const views: BillView[] = [];
  for (const id of ids) {
    const v = await getBillView(tenantId, id);
    if (v) views.push(v);
  }
  // Sắp: hóa đơn thường/vỏ trước (theo billNo), con ngay sau cha.
  views.sort((a, b) => (a.billNo ?? 0) - (b.billNo ?? 0));
  return views;
}

/** Kẹp % về [0,100] (số nguyên). */
function clampPct(v: number): number {
  return Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
}

/**
 * Điều chỉnh bill (04-03, BILL-03): giảm giá (none/amount/percent) + %phí + %VAT → tính lại tổng.
 * Chỉ bill 'open', không phải vỏ/con chia đều. Giảm giá cần settings.allow_discount.
 * (PIN gate manager/cashier kiểm ở tầng action — hàm này giả định đã qua quyền.)
 */
export async function applyBillAdjustment(
  tenantId: string,
  billId: string,
  input: { discountType: DiscountType; discountValue: number; serviceChargePct: number; vatPct: number }
): Promise<{ ok: true } | { error: string }> {
  const client = await createClient();
  const bill = await loadOpenBill(client, tenantId, billId);
  if (!bill || bill.status !== "open" || bill.split_count != null || bill.split_parent_id != null)
    return { error: "Hóa đơn không thể điều chỉnh (đã chốt hoặc đã chia đều)." };

  if (input.discountType !== "none") {
    const settings = await getSessionSettings(client, tenantId);
    if (!settings.allow_discount) return { error: "Nhà hàng đang tắt giảm giá (bật ở /admin/settings)." };
  }

  await client
    .from("bills")
    .update({
      discount_type: input.discountType,
      discount_value: input.discountType === "none" ? 0 : Math.max(0, Math.round(input.discountValue)),
      service_charge_pct: clampPct(input.serviceChargePct),
      vat_pct: clampPct(input.vatPct),
      updated_at: new Date().toISOString(),
    })
    .eq("id", billId)
    .eq("tenant_id", tenantId);

  await recomputeBill(client, tenantId, billId);
  return { ok: true };
}

/** Sửa %phí/%VAT (không phải giảm tiền trực tiếp → không cần PIN). Bill 'open', không vỏ/con. */
export async function setBillCharges(
  tenantId: string,
  billId: string,
  input: { serviceChargePct: number; vatPct: number }
): Promise<{ ok: true } | { error: string }> {
  const client = await createClient();
  const bill = await loadOpenBill(client, tenantId, billId);
  if (!bill || bill.status !== "open" || bill.split_count != null || bill.split_parent_id != null)
    return { error: "Hóa đơn không thể điều chỉnh." };

  await client
    .from("bills")
    .update({
      service_charge_pct: clampPct(input.serviceChargePct),
      vat_pct: clampPct(input.vatPct),
      updated_at: new Date().toISOString(),
    })
    .eq("id", billId)
    .eq("tenant_id", tenantId);

  await recomputeBill(client, tenantId, billId);
  return { ok: true };
}

/** Kiểm bill 'open', chưa là vỏ chia đều, chưa là con — mới cho tách/điều chỉnh. */
async function loadOpenBill(client: SupabaseClient, tenantId: string, billId: string) {
  const { data } = await client
    .from("bills")
    .select("id, status, table_session_id, split_count, split_parent_id")
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

/**
 * Tách theo món: chuyển `picks` suất từ bill nguồn sang 1 bill mới (cùng phiên). Giữ bất biến
 * Σ qty_allocated = qty. Chỉ khi bill nguồn 'open', không phải vỏ/con chia đều.
 */
export async function splitBillByItems(
  tenantId: string,
  billId: string,
  picks: SplitPick[],
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();
  const bill = await loadOpenBill(client, tenantId, billId);
  if (!bill || bill.status !== "open" || bill.split_count != null || bill.split_parent_id != null)
    return { error: "Hóa đơn không thể tách (đã chốt hoặc đã chia đều)." };

  const { data: items } = await client
    .from("bill_items")
    .select("id, order_item_id, qty_allocated, unit_price_snapshot")
    .eq("bill_id", billId)
    .eq("tenant_id", tenantId);
  const source: SplitSourceLine[] = (items ?? []).map((i) => ({
    billItemId: i.id as string,
    orderItemId: i.order_item_id as string,
    qtyAllocated: i.qty_allocated as number,
    unitPrice: i.unit_price_snapshot as number,
  }));

  let plan;
  try {
    plan = planSplitByItems(source, picks);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Tách không hợp lệ." };
  }

  const billNo = await nextBillNo(client, tenantId);
  const { data: newBill, error: nbErr } = await client
    .from("bills")
    .insert({
      tenant_id: tenantId,
      bill_no: billNo,
      table_session_id: bill.table_session_id,
      status: "open",
      created_by: actorMembershipId,
    })
    .select("id")
    .single();
  if (nbErr || !newBill) return { error: "Không tạo được hóa đơn tách." };
  const newBillId = newBill.id as string;

  const rows = plan.newBillItems.map((n) => ({
    tenant_id: tenantId,
    bill_id: newBillId,
    order_item_id: n.orderItemId,
    qty_allocated: n.qtyAllocated,
    unit_price_snapshot: n.unitPrice,
    amount: n.amount,
  }));
  const { error: biErr } = await client.from("bill_items").insert(rows);
  if (biErr) {
    await client.from("bills").delete().eq("id", newBillId);
    return { error: "Không chuyển được món sang hóa đơn tách." };
  }

  for (const u of plan.sourceUpdates)
    await client
      .from("bill_items")
      .update({ qty_allocated: u.qtyAllocated, amount: u.amount })
      .eq("id", u.billItemId)
      .eq("tenant_id", tenantId);
  if (plan.sourceDeletes.length > 0)
    await client.from("bill_items").delete().in("id", plan.sourceDeletes).eq("tenant_id", tenantId);

  await recomputeBill(client, tenantId, billId);
  await recomputeBill(client, tenantId, newBillId);
  return { billId: newBillId };
}

/**
 * Tách theo ĐƠN (04-02b): NHÂN VIÊN CHỌN các đơn (order ticket) cần tách → chuyển sang 1 hóa đơn
 * mới (kế thừa %phí/%VAT của nguồn); phần còn lại giữ ở bill nguồn. KHÔNG tách toàn bộ (nguồn phải
 * còn ≥1 đơn). Chuyển trọn bill_items của đơn được chọn (giữ bất biến Σ qty_allocated = qty).
 */
export async function splitBillByOrders(
  tenantId: string,
  billId: string,
  orderIds: string[],
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();
  const bill = await loadOpenBill(client, tenantId, billId);
  if (!bill || bill.status !== "open" || bill.split_count != null || bill.split_parent_id != null)
    return { error: "Hóa đơn không thể tách (đã chốt hoặc đã chia đều)." };
  if (!orderIds || orderIds.length === 0) return { error: "Chưa chọn đơn nào để tách." };

  const { data: src } = await client
    .from("bills")
    .select("service_charge_pct, vat_pct")
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // bill_items + order_id của từng dòng; gom id cần chuyển (đơn được chọn).
  const { data: items } = await client
    .from("bill_items")
    .select("id, order_items(order_id)")
    .eq("bill_id", billId)
    .eq("tenant_id", tenantId);

  const selected = new Set(orderIds);
  const moveIds: string[] = [];
  let totalCount = 0;
  for (const bi of items ?? []) {
    totalCount++;
    const oid = (bi.order_items as { order_id?: string } | null)?.order_id;
    if (oid && selected.has(oid)) moveIds.push(bi.id as string);
  }
  if (moveIds.length === 0) return { error: "Đơn đã chọn không có món để tách." };
  if (moveIds.length >= totalCount) return { error: "Không thể tách toàn bộ — hóa đơn nguồn sẽ rỗng." };

  const billNo = await nextBillNo(client, tenantId);
  const { data: newBill, error } = await client
    .from("bills")
    .insert({
      tenant_id: tenantId,
      bill_no: billNo,
      table_session_id: bill.table_session_id,
      status: "open",
      service_charge_pct: (src?.service_charge_pct as number) ?? 0,
      vat_pct: (src?.vat_pct as number) ?? 0,
      created_by: actorMembershipId,
    })
    .select("id")
    .single();
  if (error || !newBill) return { error: "Không tạo được hóa đơn tách." };
  const newId = newBill.id as string;

  const { error: mvErr } = await client
    .from("bill_items")
    .update({ bill_id: newId })
    .in("id", moveIds)
    .eq("tenant_id", tenantId);
  if (mvErr) return { error: "Không chuyển được món sang hóa đơn tách." };

  await recomputeBill(client, tenantId, newId);
  await recomputeBill(client, tenantId, billId);
  return { billId: newId };
}

/**
 * Cuộn lại một lượt chia đều DỞ DANG: xóa các hóa đơn con vừa tạo trong chính lời gọi
 * `splitBillEvenly` đang chạy, trả bàn về đúng trạng thái trước khi bấm "Chia đều".
 *
 * VÌ SAO CUỘN LẠI CHỨ KHÔNG ĐỂ NGUYÊN: nửa vời ở đây là trạng thái nguy hiểm nhất — con đã mang
 * tiền mà vỏ chưa có cờ `split_count`, nên KHÔNG lớp nào nhận ra bàn đang chia: món gọi thêm vẫn
 * lặng lẽ chèn vào bill cha (chốt ở `openBillForSession` chỉ chặn khi thấy cờ vỏ), trong khi N con
 * giữ nguyên số tiền cũ ⇒ Σ con ≠ vỏ mà không ai thấy. "Chưa chia" là trạng thái hợp lệ duy nhất
 * còn lại — thu ngân bấm chia lại là xong.
 *
 * BA BỘ LỌC CỦA LỆNH XÓA, không cái nào thừa — `bills.split_parent_id` và `payments.bill_id` đều
 * `on delete cascade` (0013/0012) nên mỗi dòng xóa nhầm là mất luôn dấu vết thu tiền:
 *  - `.eq("split_parent_id", billId)`: không chạm bill ngoài lượt chia này;
 *  - `.in("id", childIds)`: chỉ con vừa sinh trong CHÍNH lời gọi này. Vỏ từng chia-rồi-gỡ vẫn còn
 *    con `void` mang `split_parent_id` (0031 — void thay vì xóa), thiếu bộ lọc này là quét luôn
 *    chúng và cascade mất `payments` của lượt chia cũ;
 *  - `.eq("status", "open")`: con vừa tạo VẪN CÓ THỂ đã được thu. `getSessionBills` cố ý trả cả
 *    hóa đơn con (con thừa hưởng `table_session_id` của vỏ) và `payBill` chỉ chặn VỎ
 *    (`split_count != null`), không chặn con — nên trong lúc hàm này chạy N+1 lượt gọi mạng, thu
 *    ngân ở máy thứ hai mở panel là thấy con và bấm thu được. Cửa sổ dưới một giây, nhưng cascade
 *    thì mất thật.
 *
 * Con đã `paid` sống sót ⇒ xóa được ít dòng hơn `childIds.length` ⇒ rơi vào đúng nhánh "báo quản
 * lý" bên dưới (số dòng xóa được kiểm ngay sau lệnh). Đó là kết cục ĐÚNG: tiền đã nhận rồi thì
 * không có cách tự dọn nào an toàn, phải để người thật đối soát. Đường bình thường (mọi con còn
 * 'open') không đổi hành vi. Xóa hỏng cũng báo KHÁC đi vì lý do y hệt.
 */
async function rollbackEvenSplitChildren(
  client: SupabaseClient,
  tenantId: string,
  billId: string,
  childIds: string[]
): Promise<{ error: string }> {
  const retry = { error: "Không chia đều được hóa đơn. Vui lòng thử lại." };
  if (childIds.length === 0) return retry;
  const { data: removed, error } = await client
    .from("bills")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("split_parent_id", billId)
    .in("id", childIds)
    .eq("status", "open")
    .select("id");
  // Xóa hỏng, HOẶC dọn không hết (con nào đó đã kịp 'paid' nên bộ lọc status giữ nó lại): cả hai đều
  // để lại dữ liệu dở dang mà thu ngân không tự sửa được — phải nói KHÁC câu "thử lại".
  if (error || (removed ?? []).length < childIds.length)
    return {
      error: "Chia đều lỗi giữa chừng và không tự dọn được — báo quản lý kiểm hóa đơn của bàn trước khi thu tiền.",
    };
  return retry;
}

/**
 * Chia đều N người: bill nguồn trở thành "vỏ" (split_count=N, không thu trực tiếp), sinh N hóa đơn
 * con mỗi cái mang total/N (dư dồn con cuối). Con KHÔNG gắn món (mang số tiền phần chia).
 */
export async function splitBillEvenly(
  tenantId: string,
  billId: string,
  n: number,
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();
  const bill = await loadOpenBill(client, tenantId, billId);
  if (!bill || bill.status !== "open" || bill.split_count != null || bill.split_parent_id != null)
    return { error: "Hóa đơn không thể chia đều (đã chốt hoặc đã tách)." };

  const { data: full } = await client
    .from("bills")
    .select("total, bill_no")
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!full || (full.total as number) <= 0) return { error: "Hóa đơn chưa có tiền để chia." };

  const shares = planSplitEvenly(full.total as number, n);
  const parentNo = full.bill_no as number | null;
  // Cả hai bước dưới đây đều PHẢI kiểm error: đây là chỗ sinh ra bất biến Σ con = vỏ, hỏng nửa
  // chừng mà đi tiếp thì không lớp bảo vệ nào phía sau nhận ra (xem `rollbackEvenSplitChildren`).
  const createdChildIds: string[] = [];
  for (let i = 0; i < shares.length; i++) {
    const childNo = await nextBillNo(client, tenantId);
    const { data: child, error: childErr } = await client
      .from("bills")
      .insert({
        tenant_id: tenantId,
        bill_no: childNo,
        table_session_id: bill.table_session_id,
        status: "open",
        split_parent_id: billId,
        subtotal: shares[i],
        total: shares[i],
        note: `Chia đều ${i + 1}/${shares.length}${parentNo != null ? ` · HĐ #${parentNo}` : ""}`,
        created_by: actorMembershipId,
      })
      .select("id")
      .single();
    // Thiếu con ⇒ Σ con < vỏ. Cuộn lại hết, đừng để bàn chia dở.
    if (childErr || !child) return rollbackEvenSplitChildren(client, tenantId, billId, createdChildIds);
    createdChildIds.push(child.id as string);
  }

  // Bill nguồn thành vỏ chứa (giữ bill_items để order_items vẫn "đã phân bổ" — không tính doanh thu).
  const { error: flagErr } = await client
    .from("bills")
    .update({ split_count: shares.length, updated_at: new Date().toISOString() })
    .eq("id", billId)
    .eq("tenant_id", tenantId);
  // Con đã có mà cờ vỏ chưa bật là trạng thái tệ nhất: bàn "đang chia" mà không ai biết. Cuộn lại.
  if (flagErr) return rollbackEvenSplitChildren(client, tenantId, billId, createdChildIds);

  return { billId };
}

/**
 * Gỡ chia đều: đánh dấu N hóa đơn con là `void`, trả "vỏ" về hóa đơn thường (`split_count = null`)
 * rồi tính lại tổng từ `bill_items` — vỏ vẫn giữ nguyên dòng món nên tổng về đúng như trước khi chia.
 *
 * NGOẠI LỆ CÓ CHỦ ĐÍCH: mọi mutator khác của file này chặn `split_count != null ||
 * split_parent_id != null` (applyBillAdjustment, setBillCharges, splitBillByItems,
 * splitBillByOrders, splitBillEvenly, mergeSessionsIntoBill). Hàm này NGƯỢC LẠI — bắt buộc phải
 * nhận đúng vỏ chia đều, vì việc của nó là gỡ chính trạng thái đó. Đừng "sửa" cho giống các hàm kia.
 *
 * Đây là lối thoát cho BILL-06: hủy/thêm món trên bàn đã chia đều bị chặn (tiền của vỏ không đổi
 * theo được), nhân viên phải gỡ chia → sửa món → chia lại.
 *
 * TOÀN BỘ nghiệp vụ nằm ở RPC `unsplit_bill_evenly` (0031): kiểm điều kiện, chặn khi có con đã thu,
 * void con và bỏ cờ vỏ — trong MỘT transaction có khóa hàng. Hàm này chỉ gọi và dịch kết quả.
 * Đừng thêm lại một lớp kiểm ở đây: chốt tiền ở tầng app chốt ở thời điểm ĐỌC, cách lệnh ghi vài
 * lượt gọi mạng, nên nó vừa thừa vừa lệch được với luật thật.
 */
export async function unsplitBill(
  tenantId: string,
  billId: string,
  /** Người bấm "Gỡ chia" — RPC ghi vào `closed_by` của các hóa đơn con bị void (dấu vết ai làm). */
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();

  const { data, error } = await client.rpc("unsplit_bill_evenly", {
    p_tenant: tenantId,
    p_bill: billId,
    p_actor: actorMembershipId,
  });
  // Fail-closed: RPC hỏng thì DỪNG hẳn. Transaction đã tự rollback nên vỏ vẫn nguyên trạng chia
  // đều — thu ngân thử lại được, không có nửa vời nào để dọn.
  if (error) return { error: "Không gỡ được chia đều. Vui lòng thử lại." };

  const outcome = parseUnsplitResult(data);
  if (!outcome.ok) return { error: outcome.error };

  // Tính lại tổng SAU khi RPC đã chốt: vỏ lúc này là bill thường, hỏng bước này thì thứ còn lại
  // vẫn thu/sửa được (chỉ lệch con số tới lần mở bill kế tiếp), nên để ngoài transaction là chấp nhận.
  await recomputeBill(client, tenantId, billId);
  return { billId };
}

/**
 * Gộp nhiều phiên bàn thành 1 hóa đơn: gom order_items (≠cancelled) CHƯA phân bổ của các phiên →
 * 1 bill mới table_session_id=null. Giữ bất biến suất. Trả billId.
 */
export async function mergeSessionsIntoBill(
  tenantId: string,
  sessionIds: string[],
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();
  if (sessionIds.length < 2) return { error: "Chọn ít nhất 2 bàn để gộp." };

  // Không gộp nếu bàn nào đã có hóa đơn chốt/chia đều.
  // Bỏ 'void' ngay ở DB: hóa đơn con của một lượt chia đều ĐÃ GỠ nằm lại vĩnh viễn với
  // `split_parent_id` còn nguyên (0031 — void thay vì xóa để payments không cascade mất). Không
  // loại ra thì vòng kiểm bên dưới thấy `split_parent_id != null` và bàn đó KHÔNG BAO GIỜ gộp
  // được nữa, dù lượt chia đó đã gỡ xong từ lâu.
  const { data: existing } = await client
    .from("bills")
    .select("id, status, split_count, split_parent_id")
    .eq("tenant_id", tenantId)
    .neq("status", "void")
    .in("table_session_id", sessionIds);
  for (const b of existing ?? []) {
    if (b.status === "paid" || b.split_count != null || b.split_parent_id != null)
      return { error: "Có bàn đã chốt/chia hóa đơn — không thể gộp." };
  }
  // Giải phóng hóa đơn lẻ đang mở của các bàn (bill_items cascade) để gom lại.
  const openIds = (existing ?? []).filter((b) => b.status === "open").map((b) => b.id as string);
  if (openIds.length > 0) {
    const withChildren = await billIdsWithChildren(client, tenantId, openIds);
    // Fail-closed: không kiểm chứng được thì không xóa gì cả, gộp bàn làm lại được.
    if (withChildren === null) return { error: "Không kiểm được hóa đơn của bàn. Vui lòng thử lại." };
    const deletable = openIds.filter((id) => !withChildren.has(id));
    const voidable = openIds.filter((id) => withChildren.has(id));
    if (deletable.length > 0)
      await client.from("bills").delete().in("id", deletable).eq("tenant_id", tenantId);
    // Bill từng chia đều rồi gỡ vẫn còn con `void` treo dưới: XÓA nó là cascade mất luôn dấu vết
    // lượt chia (xem `billIdsWithChildren`). VOID thay vì xóa — bộ lọc "món đã phân bổ" chỉ tính
    // bill open|paid, nên món của nó vẫn gom được vào hóa đơn gộp y như khi xóa. Bỏ qua hẳn thì
    // ngược lại: món kẹt ở bill cũ và bàn đó KHÔNG BAO GIỜ gộp được nữa.
    if (voidable.length > 0)
      await client
        .from("bills")
        .update({ status: "void", updated_at: new Date().toISOString() })
        .in("id", voidable)
        .eq("tenant_id", tenantId)
        .eq("status", "open");
  }

  // Món được tính tiền của các phiên — DÙNG CHUNG luật với `openBillForSession`
  // (`collectBillableSessionItems`, có test). Trước đây chỗ này chỉ lọc trạng thái MÓN nên món của
  // đơn CHƯA DUYỆT vẫn lên hóa đơn gộp: hai đường vào cùng một loại hóa đơn mà hai luật khác nhau.
  // Vì vậy phải lấy CẢ `orders.status`, không chỉ `order_items.status`.
  const { data: orders, error: ordErr } = await client
    .from("orders")
    .select("status, order_items(id, unit_price_snapshot, qty, status)")
    .eq("tenant_id", tenantId)
    .in("table_session_id", sessionIds);
  // Fail-closed: đọc hỏng thì DỪNG, đừng báo "chưa có món" cho một lần đọc lỗi.
  if (ordErr) return { error: "Không đọc được món của bàn. Vui lòng thử lại." };

  const items = collectBillableSessionItems(
    (orders ?? []).map((o) => ({
      status: o.status as string,
      items: ((o.order_items as { id: string; unit_price_snapshot: number; qty: number; status: string }[]) ?? []).map(
        (it) => ({ id: it.id, unitPrice: it.unit_price_snapshot, qty: it.qty, status: it.status })
      ),
    }))
  );
  if (items.length === 0) return { error: "Các bàn chưa có món để gộp." };

  // Loại order_item đã phân bổ (open|paid). Fail-closed y hệt `openBillForSession`: đọc hỏng mà rơi
  // xuống thì mọi món đang nằm ở hóa đơn khác bị gom lại vào hóa đơn gộp ⇒ tính tiền hai lần.
  const { data: allocated, error: allocErr } = await client
    .from("bill_items")
    .select("order_item_id, bills!inner(status)")
    .eq("tenant_id", tenantId)
    .in("bills.status", ["open", "paid"]);
  if (allocErr) return { error: "Không kiểm được món đã lên hóa đơn. Vui lòng thử lại." };
  const allocatedIds = new Set((allocated ?? []).map((r) => r.order_item_id as string));
  const unallocated = items.filter((i) => !allocatedIds.has(i.id));
  if (unallocated.length === 0)
    return { error: "Các món của những bàn này đã nằm trong hóa đơn khác." };

  const billNo = await nextBillNo(client, tenantId);
  const { data: newBill, error } = await client
    .from("bills")
    .insert({
      tenant_id: tenantId,
      bill_no: billNo,
      table_session_id: null, // gộp nhiều bàn
      status: "open",
      note: "Hóa đơn gộp bàn",
      created_by: actorMembershipId,
    })
    .select("id")
    .single();
  if (error || !newBill) return { error: "Không tạo được hóa đơn gộp." };
  const newBillId = newBill.id as string;

  const rows = unallocated.map((i) => ({
    tenant_id: tenantId,
    bill_id: newBillId,
    order_item_id: i.id,
    qty_allocated: i.qty,
    unit_price_snapshot: i.unit,
    amount: i.unit * i.qty,
  }));
  const { error: biErr } = await client.from("bill_items").insert(rows);
  if (biErr) {
    await client.from("bills").delete().eq("id", newBillId);
    return { error: "Không gom được món vào hóa đơn gộp." };
  }

  await recomputeBill(client, tenantId, newBillId);
  return { billId: newBillId };
}

/**
 * Gỡ các `order_item` vừa bị hủy khỏi mọi hóa đơn ĐANG MỞ rồi tính lại tổng (BILL-06).
 *
 * Không có bước này thì bàn đã bấm "Tính tiền" xong mới hủy món sẽ vẫn bị tính tiền món đã hủy:
 * `openBillForSession` chỉ THÊM món chưa phân bổ, không XÓA món đã hủy. Luồng đơn nhóm mang về
 * đã có `syncGroupBillItems` lo việc này — dine-in thì chưa.
 *
 * Nuốt lỗi có chủ đích: món đã hủy là sự thật vận hành rồi, không được để lỗi dọn hóa đơn làm
 * hỏng cả thao tác hủy. Hóa đơn lệch còn sửa được ở lần mở bill sau.
 *
 * KHÔNG đụng hóa đơn chia đều (vỏ lẫn con) — vỏ vẫn mang status 'open' nên phải loại tường minh
 * bằng `split_count`/`split_parent_id`, giống mọi mutator khác của file. Luật nằm ở
 * `planCancelledBillCleanup` (có test), đây chỉ đọc hai cờ đó lên.
 */
export async function dropCancelledItemsFromOpenBills(
  tenantId: string,
  orderItemIds: string[]
): Promise<void> {
  if (orderItemIds.length === 0) return;
  const client = await createClient();

  const { data: lines } = await client
    .from("bill_items")
    .select("id, bill_id, order_item_id, bills!inner(status, split_count, split_parent_id)")
    .eq("tenant_id", tenantId)
    .eq("bills.status", "open")
    .in("order_item_id", orderItemIds);

  const cancelledLines = (lines ?? []).map((r) => {
    const b = r.bills as { split_count?: number | null; split_parent_id?: string | null } | null;
    return {
      billItemId: r.id as string,
      billId: r.bill_id as string,
      orderItemId: r.order_item_id as string,
      splitCount: b?.split_count ?? null,
      splitParentId: b?.split_parent_id ?? null,
    };
  });
  if (cancelledLines.length === 0) return;

  const touchedBillIds = [...new Set(cancelledLines.map((l) => l.billId))];

  const [{ data: allLines }, { data: pays }] = await Promise.all([
    client.from("bill_items").select("id, bill_id").eq("tenant_id", tenantId).in("bill_id", touchedBillIds),
    client.from("payments").select("bill_id").eq("tenant_id", tenantId).in("bill_id", touchedBillIds),
  ]);

  const plan = planCancelledBillCleanup({
    cancelledLines,
    billLines: (allLines ?? []).map((r) => ({ billItemId: r.id as string, billId: r.bill_id as string })),
    billsWithPayments: [...new Set((pays ?? []).map((r) => r.bill_id as string))],
  });

  if (plan.deleteBillItemIds.length > 0) {
    await client.from("bill_items").delete().in("id", plan.deleteBillItemIds).eq("tenant_id", tenantId);
  }
  // Tính lại CẢ bill sắp xóa (một lượt thừa trên đường hiếm): hàm này nuốt lỗi, nên nếu DELETE
  // bills hỏng thì thứ còn lại phải là bill 'open' tổng 0 chứ không phải bill rỗng còn mang tổng
  // cũ — thu ngân mở ra sẽ thu đúng số tiền không còn món nào đứng sau.
  for (const billId of [...plan.recomputeBillIds, ...plan.deleteBillIds])
    await recomputeBill(client, tenantId, billId);
  if (plan.deleteBillIds.length > 0) {
    // Bill rỗng nhưng còn con `void` treo dưới (vỏ đã gỡ chia, sau đó hủy hết món) thì ĐỪNG xóa:
    // `split_parent_id` cascade sẽ cuốn theo con lẫn `payments` của chúng. Bỏ qua là đủ — thứ còn
    // lại chỉ là bill 'open' tổng 0, lần mở bill sau dùng lại chính nó. Fail-closed: không kiểm
    // được thì không xóa dòng nào.
    const withChildren = await billIdsWithChildren(client, tenantId, plan.deleteBillIds);
    const deletable = withChildren === null ? [] : plan.deleteBillIds.filter((id) => !withChildren.has(id));
    if (deletable.length > 0) {
      await client.from("bills").delete().in("id", deletable).eq("tenant_id", tenantId);
    }
  }
}
