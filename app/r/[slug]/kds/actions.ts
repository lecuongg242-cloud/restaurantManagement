"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { setItemsReady, undoItemReady } from "@/lib/orders/kitchen-progress";

/** Bếp báo xong / trả lại (P27 ORDER-04, QD-032). Vai trò vào được KDS: kitchen, station, owner, manager. */
type KdsResult = { ok: true } | { ok: false; error: string };

async function authorizeKds(slug: string): Promise<{ tenantId: string } | { error: string }> {
  const session = await getSessionMembership(slug);
  if (!session) return { error: "Phiên hết hạn, đăng nhập lại." };
  if (!canAccess(session.role, "kds")) return { error: "Không đủ quyền." };
  return { tenantId: session.tenant.id };
}

export async function markItemsReadyAction(slug: string, itemIds: string[]): Promise<KdsResult> {
  const auth = await authorizeKds(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await setItemsReady(await createClient(), auth.tenantId, itemIds.slice(0, 200));
  if (!res.ok) return res;
  revalidatePath(`/r/${slug}/kds`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}

export async function undoItemReadyAction(slug: string, itemId: string): Promise<KdsResult> {
  const auth = await authorizeKds(slug);
  if ("error" in auth) return { ok: false, error: auth.error };
  const res = await undoItemReady(await createClient(), auth.tenantId, itemId);
  if (!res.ok) return res;
  revalidatePath(`/r/${slug}/kds`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}
