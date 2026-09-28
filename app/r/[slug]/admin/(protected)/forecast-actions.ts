"use server";

import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";

/**
 * "Hữu ích / Không hữu ích" cho nhận xét tuần (P18 18-03). Ghi dưới phiên của người bấm — RLS (0073) chỉ cho chủ /
 * quản lý ghi phản hồi của CHÍNH mình cho nhận xét của quán mình. Bấm lại thì đổi ý (upsert).
 */
export async function ghiPhanHoiNhanXet(slug: string, insightId: number, useful: boolean): Promise<{ ok: boolean }> {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "reports")) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("insight_feedback")
    .upsert(
      { insight_id: insightId, tenant_id: session.tenant.id, membership_id: session.membershipId, useful, created_at: new Date().toISOString() },
      { onConflict: "insight_id,membership_id" }
    );
  return { ok: !error };
}
