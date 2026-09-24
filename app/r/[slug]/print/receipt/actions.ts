"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { buildReceiptView } from "@/lib/billing/receipt-view";
import { daInGanDay } from "@/lib/print/dedupe";

/**
 * Ghi log 1 lần in hóa đơn vào print_jobs (type=receipt, status=printed). Gọi từ route in khi
 * trang mở (client → action). Guard membership POS (thu ngân).
 */
export async function logReceiptPrint(slug: string, billId: string): Promise<{ ok: boolean }> {
  const session = await getSessionMembership(slug);
  if (!session) return { ok: false };
  if (!canAccess(session.role, "pos")) return { ok: false };

  const receipt = await buildReceiptView(billId, session.tenant.id);
  if (!receipt) return { ok: false };

  const supabase = await createClient();

  // Xem ghi chú ở lib/print/dedupe.ts — hóa đơn định danh bằng billId.
  if (await daInGanDay(supabase, session.tenant.id, "receipt", "billId", billId)) {
    return { ok: true };
  }

  const { error } = await supabase.from("print_jobs").insert({
    tenant_id: session.tenant.id,
    type: "receipt",
    payload: { billId, billNo: receipt.billNo, total: receipt.total },
    status: "printed",
    printed_at: new Date().toISOString(),
  });
  return { ok: !error };
}
