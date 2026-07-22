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
import { planSplitByItems, planSplitEvenly, type SplitPick, type SplitSourceLine } from "./split";
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
 * Mở/đồng bộ bill của 1 phiên bàn — IDEMPOTENT. Gom mọi order_item (≠cancelled) của các order
 * thuộc phiên CHƯA được phân bổ vào bill nào (open|paid) → thêm vào bill 'open' hiện có (hoặc tạo
 * mới). Gọi lại sau khi bàn gọi thêm món → chỉ thêm phần mới. Trả billId (null nếu không có món).
 */
export async function openBillForSession(
  tenantId: string,
  sessionId: string,
  actorMembershipId: string | null
): Promise<{ billId: string } | { error: string }> {
  const client = await createClient();

  // Bàn có phiên hợp lệ + lấy order_items (≠cancelled) của phiên.
  const { data: orders } = await client
    .from("orders")
    .select("id, order_items(id, unit_price_snapshot, qty, status)")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId);

  type OI = { id: string; unit: number; qty: number };
  const sessionItems: OI[] = [];
  for (const o of orders ?? []) {
    for (const it of (o.order_items as { id: string; unit_price_snapshot: number; qty: number; status: string }[]) ?? []) {
      if (it.status !== "cancelled") {
        sessionItems.push({ id: it.id, unit: it.unit_price_snapshot, qty: it.qty });
      }
    }
  }
  if (sessionItems.length === 0) return { error: "Bàn chưa có món để tính tiền." };

  // order_item_id đã phân bổ vào bill open|paid (của tenant) → không thêm lại.
  const { data: allocated } = await client
    .from("bill_items")
    .select("order_item_id, bills!inner(status)")
    .eq("tenant_id", tenantId)
    .in("bills.status", ["open", "paid"]);
  const allocatedIds = new Set((allocated ?? []).map((r) => r.order_item_id as string));

  const unallocated = sessionItems.filter((i) => !allocatedIds.has(i.id));

  // Bill 'open' hiện có của phiên?
  const { data: openBill } = await client
    .from("bills")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();

  let billId: string;
  if (openBill) {
    billId = openBill.id as string;
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

  if (unallocated.length > 0) {
    const rows = unallocated.map((i) => ({
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
  input: { method: "cash" | "transfer"; amountReceived: number; note?: string | null },
  actorMembershipId: string | null
): Promise<{ ok: true; change: number } | { error: string }> {
  const client = await createClient();
  const { data: bill } = await client
    .from("bills")
    .select("id, status, total, table_session_id, split_count, split_parent_id")
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!bill) return { error: "Không tìm thấy hóa đơn." };
  if (bill.status !== "open") return { error: "Hóa đơn đã đóng." };
  if (bill.split_count != null) return { error: "Hóa đơn đã chia — thu ở từng phần con." };
  const total = bill.total as number;
  if (total <= 0) return { error: "Hóa đơn chưa có tiền để thu." };

  const now = new Date().toISOString();
  const { error: pErr } = await client.from("payments").insert({
    tenant_id: tenantId,
    bill_id: billId,
    method: input.method,
    amount: total,
    received_by: actorMembershipId,
    note: input.note?.trim() ? input.note.trim().slice(0, 200) : null,
  });
  if (pErr) return { error: "Ghi nhận thanh toán thất bại. Vui lòng thử lại." };

  await client
    .from("bills")
    .update({ status: "paid", paid_at: now, closed_by: actorMembershipId, updated_at: now })
    .eq("id", billId)
    .eq("tenant_id", tenantId);

  // Con chia đều: mọi con paid → cha paid.
  const parentId = (bill.split_parent_id as string) ?? null;
  if (parentId) {
    const { data: sib } = await client
      .from("bills")
      .select("status")
      .eq("tenant_id", tenantId)
      .eq("split_parent_id", parentId);
    if ((sib ?? []).every((s) => s.status === "paid"))
      await client.from("bills").update({ status: "paid", paid_at: now, updated_at: now }).eq("id", parentId).eq("tenant_id", tenantId);
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
      "id, order_item_id, qty_allocated, unit_price_snapshot, amount, order_items(name_snapshot, order_item_modifiers(name_snapshot))"
    )
    .eq("bill_id", billId)
    .eq("tenant_id", tenantId);

  const lines: BillLineView[] = (billItems ?? []).map((bi) => {
    const oi = bi.order_items as { name_snapshot?: string; order_item_modifiers?: { name_snapshot: string }[] } | null;
    return {
      billItemId: bi.id as string,
      orderItemId: bi.order_item_id as string,
      name: oi?.name_snapshot ?? "—",
      qty: bi.qty_allocated as number,
      unitPrice: bi.unit_price_snapshot as number,
      amount: bi.amount as number,
      modifiers: (oi?.order_item_modifiers ?? []).map((m) => m.name_snapshot),
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
  for (let i = 0; i < shares.length; i++) {
    const childNo = await nextBillNo(client, tenantId);
    await client.from("bills").insert({
      tenant_id: tenantId,
      bill_no: childNo,
      table_session_id: bill.table_session_id,
      status: "open",
      split_parent_id: billId,
      subtotal: shares[i],
      total: shares[i],
      note: `Chia đều ${i + 1}/${shares.length}${parentNo != null ? ` · HĐ #${parentNo}` : ""}`,
      created_by: actorMembershipId,
    });
  }

  // Bill nguồn thành vỏ chứa (giữ bill_items để order_items vẫn "đã phân bổ" — không tính doanh thu).
  await client
    .from("bills")
    .update({ split_count: shares.length, updated_at: new Date().toISOString() })
    .eq("id", billId)
    .eq("tenant_id", tenantId);

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
  const { data: existing } = await client
    .from("bills")
    .select("id, status, split_count, split_parent_id")
    .eq("tenant_id", tenantId)
    .in("table_session_id", sessionIds);
  for (const b of existing ?? []) {
    if (b.status === "paid" || b.split_count != null || b.split_parent_id != null)
      return { error: "Có bàn đã chốt/chia hóa đơn — không thể gộp." };
  }
  // Giải phóng hóa đơn lẻ đang mở của các bàn (bill_items cascade) để gom lại.
  const openIds = (existing ?? []).filter((b) => b.status === "open").map((b) => b.id as string);
  if (openIds.length > 0) await client.from("bills").delete().in("id", openIds).eq("tenant_id", tenantId);

  // order_items ≠cancelled của các phiên.
  const { data: orders } = await client
    .from("orders")
    .select("id, table_session_id, order_items(id, unit_price_snapshot, qty, status)")
    .eq("tenant_id", tenantId)
    .in("table_session_id", sessionIds);

  type OI = { id: string; unit: number; qty: number };
  const items: OI[] = [];
  for (const o of orders ?? [])
    for (const it of (o.order_items as { id: string; unit_price_snapshot: number; qty: number; status: string }[]) ?? [])
      if (it.status !== "cancelled") items.push({ id: it.id, unit: it.unit_price_snapshot, qty: it.qty });
  if (items.length === 0) return { error: "Các bàn chưa có món để gộp." };

  // Loại order_item đã phân bổ (open|paid).
  const { data: allocated } = await client
    .from("bill_items")
    .select("order_item_id, bills!inner(status)")
    .eq("tenant_id", tenantId)
    .in("bills.status", ["open", "paid"]);
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
