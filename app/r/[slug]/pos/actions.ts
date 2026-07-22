"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { getCurrentStaff } from "@/app/r/[slug]/station-actions";
import { canTransition, canTransitionItem } from "@/lib/orders/status";
import { broadcastOrderStatus } from "@/lib/orders/broadcast";
import { createStaffOrder, nextKitchenNo } from "@/lib/orders/create-order";
import { verifyPinForRoles } from "@/lib/auth/pin-gate";
import type { OrderLineInput } from "@/lib/orders/types";

export type ActionResult = { ok: true; orderId?: string } | { ok: false; error: string };

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

/** Đánh 'Đã phục vụ' mức món (ready→served); roll-up order→served khi mọi item xong. */
export async function serveItem(slug: string, itemId: string): Promise<ActionResult> {
  const auth = await authorizePos(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, status")
    .eq("id", itemId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Không tìm thấy món." };
  if (!canTransitionItem(item.status, "served"))
    return { ok: false, error: "Món chưa sẵn sàng để phục vụ." };

  const { error } = await supabase
    .from("order_items")
    .update({ status: "served" })
    .eq("id", itemId)
    .eq("tenant_id", auth.tenantId);
  if (error) return { ok: false, error: "Cập nhật thất bại." };

  // Roll-up: mọi item served/cancelled → order served.
  const { data: siblings } = await supabase
    .from("order_items")
    .select("status")
    .eq("order_id", item.order_id)
    .eq("tenant_id", auth.tenantId);
  const allDone = (siblings ?? []).every((s) => s.status === "served" || s.status === "cancelled");
  if (allDone) {
    const { data: ord } = await supabase
      .from("orders")
      .select("status")
      .eq("id", item.order_id)
      .maybeSingle();
    if (ord && canTransition(ord.status, "served")) {
      await supabase
        .from("orders")
        .update({ status: "served", updated_at: new Date().toISOString() })
        .eq("id", item.order_id)
        .eq("tenant_id", auth.tenantId);
    }
  }

  await broadcastOrderStatus(item.order_id);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true, orderId: item.order_id };
}

/** Đóng phiên thủ công: chỉ khi mọi món served/cancelled. Bàn về available. */
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

  // Còn order chờ duyệt hoặc món chưa phục vụ → chặn đóng.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, order_items(status)")
    .eq("table_session_id", sessionId)
    .eq("tenant_id", auth.tenantId);
  for (const o of orders ?? []) {
    if (o.status === "pending_confirm")
      return { ok: false, error: "Còn order chờ duyệt. Xử lý trước khi đóng phiên." };
    const items = (o.order_items as { status: string }[]) ?? [];
    if (items.some((it) => it.status !== "served" && it.status !== "cancelled"))
      return { ok: false, error: "Còn món chưa phục vụ. Không thể đóng phiên." };
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
