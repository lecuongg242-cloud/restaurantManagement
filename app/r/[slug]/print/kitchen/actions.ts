"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildKitchenTicket } from "@/lib/print/kitchen-ticket";

/**
 * Ghi log 1 lần in phiếu bếp vào print_jobs (type=kitchen_ticket, status=printed).
 * Gọi từ route in khi trang mở (client → action). Guard membership POS/KDS.
 */
export async function logKitchenTicketPrint(
  slug: string,
  orderId: string
): Promise<{ ok: boolean }> {
  const session = await getSessionMembership(slug);
  if (!session) return { ok: false };
  if (!canAccess(session.role, "pos") && !canAccess(session.role, "kds")) return { ok: false };

  const ticket = await buildKitchenTicket(orderId, session.tenant.id);
  if (!ticket) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("print_jobs").insert({
    tenant_id: session.tenant.id,
    type: "kitchen_ticket",
    payload: ticket,
    status: "printed",
    printed_at: new Date().toISOString(),
  });
  return { ok: !error };
}
