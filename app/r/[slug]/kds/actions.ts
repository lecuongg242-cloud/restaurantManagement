"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { getCurrentStaff } from "@/app/r/[slug]/station-actions";
import { canTransition, canTransitionItem } from "@/lib/orders/status";
import { broadcastOrderStatus } from "@/lib/orders/broadcast";

export type ActionResult = { ok: true; orderId?: string } | { ok: false; error: string };

/** Guard: phiên nhân viên có quyền KDS (station/kitchen/owner/manager). Trả staffId thao tác. */
async function authorizeKds(
  slug: string
): Promise<{ tenantId: string; staffId: string } | { error: string }> {
  const session = await getSessionMembership(slug);
  if (!session) return { error: "Phiên hết hạn, đăng nhập lại." };
  if (!canAccess(session.role, "kds")) return { error: "Không đủ quyền." };

  const current = await getCurrentStaff(slug, "kds");
  if (current) return { tenantId: session.tenant.id, staffId: current.id };
  if (session.role === "owner" || session.role === "manager") {
    return { tenantId: session.tenant.id, staffId: session.membershipId };
  }
  return { error: "Vui lòng chọn nhân viên (nhập PIN) trước khi thao tác." };
}

/** Bắt đầu làm món: queued → preparing; order confirmed → preparing (nếu là món đầu). */
export async function startItem(slug: string, itemId: string): Promise<ActionResult> {
  const auth = await authorizeKds(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, status")
    .eq("id", itemId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Không tìm thấy món." };
  if (!canTransitionItem(item.status, "preparing"))
    return { ok: false, error: "Món không ở trạng thái chờ làm." };

  const { error } = await supabase
    .from("order_items")
    .update({ status: "preparing" })
    .eq("id", itemId)
    .eq("tenant_id", auth.tenantId);
  if (error) return { ok: false, error: "Cập nhật thất bại." };

  // Order confirmed → preparing khi có món bắt đầu.
  const { data: ord } = await supabase
    .from("orders")
    .select("status")
    .eq("id", item.order_id)
    .maybeSingle();
  if (ord && canTransition(ord.status, "preparing")) {
    await supabase
      .from("orders")
      .update({ status: "preparing", updated_at: new Date().toISOString() })
      .eq("id", item.order_id)
      .eq("tenant_id", auth.tenantId);
  }

  await broadcastOrderStatus(item.order_id);
  revalidatePath(`/r/${slug}/kds`);
  return { ok: true, orderId: item.order_id };
}

/** Xong món: preparing → ready + prepared_at; roll-up order → ready khi mọi món xong. */
export async function readyItem(slug: string, itemId: string): Promise<ActionResult> {
  const auth = await authorizeKds(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, status")
    .eq("id", itemId)
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Không tìm thấy món." };
  if (!canTransitionItem(item.status, "ready"))
    return { ok: false, error: "Món chưa bắt đầu làm." };

  const { error } = await supabase
    .from("order_items")
    .update({ status: "ready", prepared_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("tenant_id", auth.tenantId);
  if (error) return { ok: false, error: "Cập nhật thất bại." };

  // Roll-up: mọi item ∈ {ready, served, cancelled} → order ready.
  const { data: siblings } = await supabase
    .from("order_items")
    .select("status")
    .eq("order_id", item.order_id)
    .eq("tenant_id", auth.tenantId);
  const allReady = (siblings ?? []).every(
    (s) => s.status === "ready" || s.status === "served" || s.status === "cancelled"
  );
  if (allReady) {
    const { data: ord } = await supabase
      .from("orders")
      .select("status")
      .eq("id", item.order_id)
      .maybeSingle();
    if (ord && canTransition(ord.status, "ready")) {
      await supabase
        .from("orders")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", item.order_id)
        .eq("tenant_id", auth.tenantId);
    }
  }

  await broadcastOrderStatus(item.order_id);
  revalidatePath(`/r/${slug}/kds`);
  return { ok: true, orderId: item.order_id };
}
