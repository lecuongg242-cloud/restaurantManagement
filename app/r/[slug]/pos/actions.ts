"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { getCurrentStaff } from "@/app/r/[slug]/station-actions";
import { canTransition } from "@/lib/orders/status";
import { broadcastOrderStatus } from "@/lib/orders/broadcast";
import { createStaffOrder, createStaffTakeawayOrder, nextKitchenNo } from "@/lib/orders/create-order";
import {
  createStaffReservation,
  decideReservation,
  assignReservationTable,
  type CreateStaffReservationInput,
} from "@/lib/reservations/reservations";
import {
  acceptOnlineOrder,
  rejectOnlineOrder,
  markOnlineReady,
  getOnlineOrder,
  type OnlineOrderView,
} from "@/lib/orders/online";
import { verifyPinForRoles } from "@/lib/auth/pin-gate";
import {
  openBillForSession,
  openBillForOrder,
  getBillView,
  getSessionBills,
  splitBillByItems,
  splitBillEvenly,
  mergeSessionsIntoBill,
  applyBillAdjustment,
  setBillCharges,
  payBill,
} from "@/lib/billing/bill";
import type { BillView, DiscountType, PaymentMethod } from "@/lib/billing/types";
import type { SplitPick } from "@/lib/billing/split";
import type { OrderLineInput } from "@/lib/orders/types";

export type ActionResult = { ok: true; orderId?: string } | { ok: false; error: string };
export type BillsActionResult = { ok: true; bills: BillView[] } | { ok: false; error: string };
export type PayActionResult =
  | { ok: true; change: number; bills: BillView[] }
  | { ok: false; error: string };

/**
 * Guard chung: phải là phiên nhân viên có quyền POS. Trả staffId thao tác:
 *  - nhân viên trạm đã chọn (cookie PIN P1), hoặc
 *  - membership của owner/manager đăng nhập email.
 */
async function authorizePos(
  slug: string
): Promise<{ tenantId: string; staffId: string } | { error: string }> {
  const session = await getSessionMembership(slug);
  if (!session) return { error: "Phiên hết hạn, đăng nhập lại." };
  if (!canAccess(session.role, "pos")) return { error: "Không đủ quyền." };

  const current = await getCurrentStaff(slug, "pos");
  if (current) return { tenantId: session.tenant.id, staffId: current.id };
  if (session.role === "owner" || session.role === "manager") {
    return { tenantId: session.tenant.id, staffId: session.membershipId };
  }
  return { error: "Vui lòng chọn nhân viên (nhập PIN) trước khi thao tác." };
}

/** Duyệt order QR: pending_confirm → confirmed (+confirmed_at, confirmed_by). */
export async function approveOrder(slug: string, orderId: string): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Không tìm thấy đơn." };
  if (!canTransition(order.status, "confirmed"))
    return { ok: false, error: "Đơn không ở trạng thái chờ duyệt." };

  const kitchenNo = await nextKitchenNo(supabase, auth.tenantId);
  const { error } = await supabase
    .from("orders")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: auth.staffId,
      kitchen_no: kitchenNo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("tenant_id", auth.tenantId)
    .eq("status", "pending_confirm");
  if (error) return { ok: false, error: "Duyệt thất bại. Vui lòng thử lại." };

  await broadcastOrderStatus(orderId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, orderId };
}

/** Từ chối order QR: bắt buộc lý do; pending_confirm → cancelled + items cancelled. */
export async function rejectOrder(
  slug: string,
  orderId: string,
  reason: string
): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const trimmed = reason?.trim();
  if (!trimmed) return { ok: false, error: "Vui lòng nhập lý do từ chối." };
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Không tìm thấy đơn." };
  if (!canTransition(order.status, "cancelled"))
    return { ok: false, error: "Đơn không thể từ chối ở trạng thái này." };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled", cancel_reason: trimmed.slice(0, 300), updated_at: now })
    .eq("id", orderId)
    .eq("tenant_id", auth.tenantId)
    .eq("status", "pending_confirm");
  if (error) return { ok: false, error: "Từ chối thất bại. Vui lòng thử lại." };

  await supabase
    .from("order_items")
    .update({ status: "cancelled", cancel_reason: trimmed.slice(0, 300) })
    .eq("order_id", orderId)
    .eq("tenant_id", auth.tenantId)
    .neq("status", "cancelled");

  await broadcastOrderStatus(orderId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, orderId };
}


/**
 * Đóng phiên thủ công: chỉ khi mọi món served/cancelled VÀ đã thanh toán hết (P4). Bàn về available.
 * Bình thường phiên TỰ đóng khi thu tiền (closeSessionIfSettled) — nút này là fallback cho phiên
 * không còn doanh thu (mọi món đã hủy). Chặn đóng nếu còn hóa đơn chưa thanh toán → tránh mất tiền.
 */
export async function closeSession(slug: string, sessionId: string): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();

  const { data: sess } = await supabase
    .from("table_sessions")
    .select("id, table_id, status")
    .eq("id", sessionId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (!sess || sess.status !== "open")
    return { ok: false, error: "Phiên không hợp lệ hoặc đã đóng." };

  // Chặn đóng nếu còn order chờ duyệt HOẶC còn món chưa THU ĐỦ. Món 'served' = đã thu đủ (payBill
  // đánh dấu khi thanh toán). Món đã hủy không tính. Phiên toàn món đã hủy → cho đóng (dọn bàn).
  const { data: orders } = await supabase
    .from("orders")
    .select("status, order_items(status)")
    .eq("table_session_id", sessionId)
    .eq("tenant_id", auth.tenantId);
  for (const o of orders ?? []) {
    if (o.status === "pending_confirm")
      return { ok: false, error: "Còn order chờ duyệt. Xử lý trước khi đóng phiên." };
    const items = (o.order_items as { status: string }[]) ?? [];
    if (items.some((it) => it.status !== "served" && it.status !== "cancelled"))
      return { ok: false, error: "Còn hóa đơn chưa thanh toán. Vui lòng thu tiền trước khi đóng phiên." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("table_sessions")
    .update({ status: "closed", closed_at: now })
    .eq("id", sessionId)
    .eq("tenant_id", auth.tenantId);
  if (error) return { ok: false, error: "Đóng phiên thất bại." };

  await supabase
    .from("tables")
    .update({ status: "available" })
    .eq("id", sess.table_id)
    .eq("tenant_id", auth.tenantId);

  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}

/**
 * Mở/đồng bộ bill của phiên bàn (04-01, BILL-01) → trả DANH SÁCH bill của phiên (04-02: 1 bàn có
 * thể nhiều bill sau tách). Idempotent: gọi lại sau khi bàn gọi thêm món chỉ thêm phần mới.
 */
export async function openBillAction(slug: string, sessionId: string): Promise<BillsActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };

  const res = await openBillForSession(auth.tenantId, sessionId, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };

  const bills = await getSessionBills(auth.tenantId, sessionId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, bills };
}

/** Đọc lại danh sách bill của phiên (refresh panel sau thao tác tách/gộp). */
export async function refreshSessionBillsAction(
  slug: string,
  sessionId: string
): Promise<BillsActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const bills = await getSessionBills(auth.tenantId, sessionId);
  return { ok: true, bills };
}

/** Tách theo món (BILL-02). Trả danh sách bill mới của phiên. */
export async function splitByItemsAction(
  slug: string,
  sessionId: string,
  billId: string,
  picks: SplitPick[]
): Promise<BillsActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await splitBillByItems(auth.tenantId, billId, picks, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  const bills = await getSessionBills(auth.tenantId, sessionId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, bills };
}

/** Chia đều N người (BILL-02) → N hóa đơn con. Trả danh sách bill của phiên. */
export async function splitEvenlyAction(
  slug: string,
  sessionId: string,
  billId: string,
  n: number
): Promise<BillsActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await splitBillEvenly(auth.tenantId, billId, n, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  const bills = await getSessionBills(auth.tenantId, sessionId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, bills };
}

/** Gộp nhiều bàn thành 1 hóa đơn (BILL-02). Trả danh sách bill của phiên đang xem. */
export async function mergeTablesAction(
  slug: string,
  currentSessionId: string,
  sessionIds: string[]
): Promise<BillsActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await mergeSessionsIntoBill(auth.tenantId, sessionIds, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  const bills = await getSessionBills(auth.tenantId, currentSessionId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, bills };
}

/**
 * Áp giảm giá + %phí + %VAT (BILL-03, D9). Giảm giá cần PIN manager/cashier (trừ owner/manager
 * đăng nhập email). Trả danh sách bill mới của phiên.
 */
export async function applyDiscountAction(
  slug: string,
  sessionId: string,
  billId: string,
  payload: { discountType: DiscountType; discountValue: number; serviceChargePct: number; vatPct: number },
  membershipId?: string,
  pin?: string
): Promise<BillsActionResult> {
  const session = await getSessionMembership(slug);
  if (!session) return { ok: false, error: "Phiên hết hạn, đăng nhập lại." };
  if (!canAccess(session.role, "pos")) return { ok: false, error: "Không đủ quyền." };
  const tenantId = session.tenant.id;

  // PIN gate cho giảm giá (owner/manager đăng nhập email được bỏ qua).
  if (payload.discountType !== "none" && session.role !== "owner" && session.role !== "manager") {
    const gate = await verifyPinForRoles({
      tenantId,
      membershipId: membershipId ?? "",
      pin: pin ?? "",
      allowedRoles: ["manager", "cashier"],
    });
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  const res = await applyBillAdjustment(tenantId, billId, payload);
  if ("error" in res) return { ok: false, error: res.error };
  const bills = await getSessionBills(tenantId, sessionId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, bills };
}

/**
 * Thu tiền + đóng bill (04-04, BILL-04). Thu đủ total; tự đóng phiên bàn đã thanh toán hết
 * (TABLE-02). Trả tiền thối + danh sách bill mới của phiên.
 */
export async function payBillAction(
  slug: string,
  sessionId: string,
  billId: string,
  input: { method: PaymentMethod; amountReceived: number; note?: string }
): Promise<PayActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await payBill(auth.tenantId, billId, input, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  const bills = await getSessionBills(auth.tenantId, sessionId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, change: res.change, bills };
}

/** Sửa %phí/%VAT trên bill (không cần PIN). Trả danh sách bill của phiên. */
export async function setChargePctAction(
  slug: string,
  sessionId: string,
  billId: string,
  payload: { serviceChargePct: number; vatPct: number }
): Promise<BillsActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await setBillCharges(auth.tenantId, billId, payload);
  if ("error" in res) return { ok: false, error: res.error };
  const bills = await getSessionBills(auth.tenantId, sessionId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, bills };
}

/**
 * Nhân viên đặt bàn hộ khách (qua điện thoại) từ POS → tạo thẳng 'confirmed'. Thu ngân/phục vụ
 * làm được (đã có quyền POS). KHÔNG giữ bàn/mở phiên (QD-008 D-P5-2) — chỉ ghi lịch đặt.
 */
export async function createReservationAction(
  slug: string,
  input: CreateStaffReservationInput
): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await createStaffReservation(auth.tenantId, input, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/reservations`);
  return { ok: true };
}

// ---- Đặt bàn: duyệt/từ chối (POS — thu ngân/phục vụ) ------------------------

/** Xác nhận đặt bàn (pending → confirmed). */
export async function confirmReservationAction(slug: string, reservationId: string): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await decideReservation({
    tenantId: auth.tenantId,
    reservationId,
    decision: "confirmed",
    decidedBy: auth.staffId,
  });
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/reservations`);
  return { ok: true };
}

/** Từ chối đặt bàn (pending → rejected, bắt buộc lý do). */
export async function rejectReservationAction(
  slug: string,
  reservationId: string,
  reason: string
): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await decideReservation({
    tenantId: auth.tenantId,
    reservationId,
    decision: "rejected",
    decidedBy: auth.staffId,
    rejectReason: reason,
  });
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/reservations`);
  return { ok: true };
}

/** Gán / đổi bàn cho đặt bàn (tableId rỗng = bỏ gán). */
export async function assignReservationTableAction(
  slug: string,
  reservationId: string,
  tableId: string | null
): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await assignReservationTable(auth.tenantId, reservationId, tableId || null);
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/reservations`);
  return { ok: true };
}

// ---- Đơn online: nhận/từ chối/sẵn sàng/thu tiền (POS) -----------------------

export async function acceptOnlineOrderAction(slug: string, orderId: string): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await acceptOnlineOrder(auth.tenantId, orderId, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/online`);
  return { ok: true };
}

export async function rejectOnlineOrderAction(
  slug: string,
  orderId: string,
  reason: string
): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await rejectOnlineOrder(auth.tenantId, orderId, reason);
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/online`);
  return { ok: true };
}

export async function markReadyOnlineOrderAction(slug: string, orderId: string): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await markOnlineReady(auth.tenantId, orderId);
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/online`);
  return { ok: true };
}

/** Mở (hoặc lấy) bill của đơn online để thu tiền. Trả BillView. */
export async function openOnlineBillAction(
  slug: string,
  orderId: string
): Promise<{ ok: true; bill: BillView } | { ok: false; error: string }> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await openBillForOrder(auth.tenantId, orderId, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  const bill = await getBillView(auth.tenantId, res.billId);
  if (!bill) return { ok: false, error: "Không tải được hóa đơn." };
  return { ok: true, bill };
}

/** Thu tiền + hoàn tất đơn online (payBill đặt đơn 'completed'). Trả tiền thối. */
export async function payOnlineBillAction(
  slug: string,
  billId: string,
  input: { method: PaymentMethod; amountReceived: number }
): Promise<{ ok: true; change: number } | { ok: false; error: string }> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await payBill(auth.tenantId, billId, input, auth.staffId);
  if ("error" in res) return { ok: false, error: res.error };
  revalidatePath(`/r/${slug}/pos/online`);
  return { ok: true, change: res.change };
}

/** Thêm món thay khách: source=staff, vào thẳng confirmed (ORDER-03). */
export async function createStaffOrderAction(
  slug: string,
  tableId: string,
  lines: OrderLineInput[],
  note?: string
): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await createStaffOrder({
    tenantId: auth.tenantId,
    tableId,
    lines,
    note,
    actingStaffId: auth.staffId,
  });
  if ("error" in result) return { ok: false, error: result.error };

  await broadcastOrderStatus(result.orderId);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, orderId: result.orderId };
}

/** Lấy chi tiết 1 đơn online/takeaway (để hiển thị món + tổng như panel bàn). */
export async function getOnlineOrderAction(
  slug: string,
  orderId: string
): Promise<{ ok: true; order: OnlineOrderView | null } | { ok: false; error: string }> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const order = await getOnlineOrder(auth.tenantId, orderId);
  return { ok: true, order };
}

/** Bán mang về tại quầy: tạo đơn takeaway (source=staff, xác nhận ngay) → vào /pos/online. */
export async function createTakeawayOrderAction(
  slug: string,
  lines: OrderLineInput[],
  contact?: { name?: string; phone?: string },
  note?: string
): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };

  const result = await createStaffTakeawayOrder({
    tenantId: auth.tenantId,
    lines,
    customerName: contact?.name,
    customerPhone: contact?.phone,
    note,
    actingStaffId: auth.staffId,
  });
  if ("error" in result) return { ok: false, error: result.error };

  await broadcastOrderStatus(result.orderId);
  revalidatePath(`/r/${slug}/pos/online`);
  return { ok: true, orderId: result.orderId };
}

/**
 * Hủy món đã gửi bếp có kiểm soát (03-04, D9, ORDER-05). Yêu cầu:
 *  - lý do bắt buộc;
 *  - PIN của membership vai trò manager/cashier (so bcrypt server) — TRỪ khi phiên đăng nhập
 *    là owner/manager (thao tác như chính họ, không cần PIN).
 * Ghi log truy vết: cancel_reason + cancelled_by. Roll-up + broadcast (khách + KDS thấy realtime).
 * (Order pending_confirm dùng rejectOrder — không đi đường này.)
 */
export async function cancelOrderItem(
  slug: string,
  input: { itemId: string; membershipId?: string; pin?: string; reason: string }
): Promise<ActionResult> {
  const session = await getSessionMembership(slug);
  if (!session) return { ok: false, error: "Phiên hết hạn, đăng nhập lại." };
  if (!canAccess(session.role, "pos")) return { ok: false, error: "Không đủ quyền." };

  const reason = input.reason?.trim();
  if (!reason) return { ok: false, error: "Vui lòng nhập lý do hủy." };

  const tenantId = session.tenant.id;

  // Xác định người duyệt hủy.
  let cancelledBy: string;
  if (session.role === "owner" || session.role === "manager") {
    cancelledBy = session.membershipId; // đường tắt, không cần PIN
  } else {
    const gate = await verifyPinForRoles({
      tenantId,
      membershipId: input.membershipId ?? "",
      pin: input.pin ?? "",
      allowedRoles: ["manager", "cashier"],
    });
    if (!gate.ok) return { ok: false, error: gate.error };
    cancelledBy = gate.staffId;
  }

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, status")
    .eq("id", input.itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Không tìm thấy món." };
  if (item.status === "served" || item.status === "cancelled")
    return { ok: false, error: "Món đã phục vụ hoặc đã hủy, không thể hủy." };

  const { error } = await supabase
    .from("order_items")
    .update({ status: "cancelled", cancel_reason: reason.slice(0, 300), cancelled_by: cancelledBy })
    .eq("id", input.itemId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: "Hủy món thất bại. Vui lòng thử lại." };

  // Roll-up order: mọi món cancelled → order cancelled; còn lại đều ready → order ready.
  const { data: siblings } = await supabase
    .from("order_items")
    .select("status")
    .eq("order_id", item.order_id)
    .eq("tenant_id", tenantId);
  const rows = siblings ?? [];
  const now = new Date().toISOString();
  if (rows.length > 0 && rows.every((s) => s.status === "cancelled")) {
    const { data: ord } = await supabase
      .from("orders")
      .select("status")
      .eq("id", item.order_id)
      .maybeSingle();
    if (ord && canTransition(ord.status, "cancelled")) {
      await supabase
        .from("orders")
        .update({ status: "cancelled", cancel_reason: "Tất cả món bị hủy", updated_at: now })
        .eq("id", item.order_id)
        .eq("tenant_id", tenantId);
    }
  } else {
    const remaining = rows.filter((s) => s.status !== "cancelled");
    if (remaining.length > 0 && remaining.every((s) => s.status === "ready")) {
      const { data: ord } = await supabase
        .from("orders")
        .select("status")
        .eq("id", item.order_id)
        .maybeSingle();
      if (ord && canTransition(ord.status, "ready")) {
        await supabase
          .from("orders")
          .update({ status: "ready", updated_at: now })
          .eq("id", item.order_id)
          .eq("tenant_id", tenantId);
      }
    }
  }

  await broadcastOrderStatus(item.order_id);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, orderId: item.order_id };
}
