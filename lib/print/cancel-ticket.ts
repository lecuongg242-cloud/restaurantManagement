/**
 * Phiếu HỦY MÓN ra bếp/bar (P37, PRINT-23): hủy món ĐÃ gửi bếp thì bếp cầm tờ "HỦY MÓN" để dừng làm, như mẫu "Hủy món" của
 * KiotViet. Chỉ quán in qua cầu in (bridge) — quán in trình duyệt không có máy in bếp tự động để gửi tới.
 *
 * Không bao giờ làm hỏng thao tác hủy: mọi lỗi ở đây chỉ bỏ qua phiếu.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { cauInConSong } from "./cau-in";
import { buildCancelTickets } from "./kitchen-ticket";

/**
 * Cầu in từ bản này mới lấy phiếu `cancel_ticket` (scripts/print-bridge.mjs BRIDGE_VERSION). Cầu in cũ hơn (app Windows ≤ 1.0.5,
 * app Android) không đọc loại phiếu này — xếp cho nó thì phiếu nằm chờ mãi, nên không xếp.
 */
export const CAU_IN_HUY_MON_TU = 5;

/** "Đã gửi bếp" = đơn có phiếu bếp đã in hoặc đang chờ cầu in (không tính lượt bị thay / hỏng). */
export async function queueCancelTickets(input: {
  tenantId: string;
  orderIds: string[];
  itemIds: string[];
  reason: string;
  cancelledByMembershipId: string;
  cancelledAt: string;
}): Promise<number> {
  try {
    if (input.itemIds.length === 0 || input.orderIds.length === 0) return 0;
    const supabase = await createClient();
    const { data: tenant } = await supabase.from("tenants").select("settings").eq("id", input.tenantId).maybeSingle();
    if (parseSettings(tenant?.settings).print_mode !== "bridge") return 0;
    const { data: nhip } = await supabase
      .from("printer_heartbeats")
      .select("seen_at, version")
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (!cauInConSong((nhip?.seen_at as string | null) ?? null, Date.now())) return 0;
    if (Number(nhip?.version ?? 0) < CAU_IN_HUY_MON_TU) return 0;

    const { data: who } = await supabase
      .from("memberships")
      .select("display_name")
      .eq("id", input.cancelledByMembershipId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    const rows: Record<string, unknown>[] = [];
    for (const orderId of input.orderIds) {
      const { count } = await supabase
        .from("print_jobs")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", input.tenantId)
        .eq("type", "kitchen_ticket")
        .in("status", ["pending", "printed"])
        .contains("payload", { orderId });
      if (!count) continue;
      const tickets = await buildCancelTickets(orderId, input.tenantId, input.itemIds, {
        reason: input.reason,
        cancelledBy: (who?.display_name as string | undefined) ?? null,
        cancelledAt: input.cancelledAt,
      });
      for (const t of tickets) {
        if (t.view.items.length === 0) continue;
        rows.push({
          tenant_id: input.tenantId,
          type: "cancel_ticket",
          target_station: t.target,
          payload: t.view,
          status: "pending",
        });
      }
    }
    if (rows.length === 0) return 0;
    const { error } = await supabase.from("print_jobs").insert(rows);
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}
