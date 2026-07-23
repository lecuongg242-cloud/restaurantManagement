/**
 * "Gọi nhân viên" từ menu khách QR (CALL-01). Khách ẩn danh insert qua service role; POS đọc/ghi
 * dưới phiên RLS (cách ly tenant). Dedupe: đã có call pending của bàn trong 45s → không tạo thêm
 * (tránh spam khi khách bấm nhiều lần).
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveTable } from "@/lib/orders/customer-menu";

export type PosCall = {
  id: string;
  tableId: string;
  tableName: string;
  note: string | null;
  created_at: string;
};

const DEDUPE_MS = 45_000;
const NOTE_MAX = 160;

export type CallResult = { ok: true; already?: boolean } | { error: string };

/**
 * Khách QR gọi nhân viên, kèm yêu cầu (note) không bắt buộc. Resolve token → bàn; insert (service
 * role). Dedupe theo (bàn + CÙNG nội dung) trong 45s → chống double-tap, nhưng vẫn cho gửi yêu cầu
 * KHÁC (vd "tính tiền" rồi "thêm đá") ngay sau đó.
 */
export async function createStaffCall(
  slug: string,
  qrToken: string,
  note = ""
): Promise<CallResult> {
  const resolved = qrToken ? await resolveTable(slug, qrToken) : null;
  if (!resolved) return { error: "Không xác định được bàn. Vui lòng quét lại mã QR." };

  const cleanNote = note.trim().slice(0, NOTE_MAX) || null;
  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - DEDUPE_MS).toISOString();

  let recentQ = admin
    .from("staff_calls")
    .select("id")
    .eq("tenant_id", resolved.tenant_id)
    .eq("table_id", resolved.table.id)
    .eq("status", "pending")
    .gte("created_at", sinceIso);
  recentQ = cleanNote === null ? recentQ.is("note", null) : recentQ.eq("note", cleanNote);
  const { data: recent } = await recentQ.limit(1);
  if (recent && recent.length > 0) return { ok: true, already: true };

  const { error } = await admin.from("staff_calls").insert({
    tenant_id: resolved.tenant_id,
    table_id: resolved.table.id,
    table_name: resolved.table.name,
    note: cleanNote,
    status: "pending",
  });
  if (error) return { error: "Gọi nhân viên thất bại. Vui lòng thử lại." };
  return { ok: true };
}

/** Danh sách bàn đang gọi (pending) cho snapshot POS — chạy dưới phiên RLS. */
export async function getPendingCalls(tenantId: string): Promise<PosCall[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_calls")
    .select("id, table_id, table_name, note, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    tableId: r.table_id as string,
    tableName: r.table_name as string,
    note: (r.note as string | null) ?? null,
    created_at: r.created_at as string,
  }));
}

/** Nhân viên đánh dấu đã xử lý (pending → resolved). */
export async function resolveStaffCall(
  tenantId: string,
  callId: string,
  staffId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_calls")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: staffId })
    .eq("id", callId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending");
  if (error) return { error: "Không cập nhật được. Thử lại." };
  return { ok: true };
}
