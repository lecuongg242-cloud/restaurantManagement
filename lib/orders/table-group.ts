/**
 * Ghép bàn (P23, QD-029): tra "phiên đang mở của một bàn" khi bàn có thể là BÀN PHỤ của một nhóm.
 * Một chỗ duy nhất cho mọi đường mở/ghép phiên (POS, QR) và các chốt chặn đọc phiên theo bàn — tra lệch nhau
 * là đơn của bàn phụ rơi vào một phiên thứ hai, tách khỏi nhóm.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { groupTableName, type GroupTableRef } from "./place-label";

/**
 * Thứ tự: phiên mà bàn được GHÉP vào (nếu còn mở) → phiên mở của chính bàn. `{ error }` khi đọc hỏng — nơi gọi
 * tự quyết fail-closed hay không.
 */
export async function findOpenSessionForTable(
  client: SupabaseClient,
  tenantId: string,
  tableId: string
): Promise<{ id: string | null } | { error: string }> {
  const { data: table, error: tErr } = await client
    .from("tables")
    .select("group_session_id")
    .eq("tenant_id", tenantId)
    .eq("id", tableId)
    .maybeSingle();
  if (tErr) return { error: tErr.message };
  const groupId = (table?.group_session_id as string | null) ?? null;
  if (groupId) {
    const { data: g, error: gErr } = await client
      .from("table_sessions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", groupId)
      .eq("status", "open")
      .maybeSingle();
    if (gErr) return { error: gErr.message };
    if (g) return { id: g.id as string };
  }
  const { data: own, error: oErr } = await client
    .from("table_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();
  if (oErr) return { error: oErr.message };
  return { id: (own?.id as string | undefined) ?? null };
}

/**
 * Đóng phiên ⇒ trả MỌI bàn của nhóm về trống và gỡ trỏ nhóm (bất biến: phiên đóng thì không bàn nào trỏ về nó).
 * Bàn chính vẫn do nơi gọi tự trả như trước.
 */
export async function releaseGroupTables(client: SupabaseClient, tenantId: string, sessionId: string) {
  await client
    .from("tables")
    .update({ status: "available", group_session_id: null })
    .eq("tenant_id", tenantId)
    .eq("group_session_id", sessionId);
}

/** Mọi bàn của quán ở dạng tối thiểu cho nhãn nhóm. Vài chục dòng/quán — rẻ hơn tra từng bàn. */
export async function loadGroupRefs(
  client: SupabaseClient,
  tenantId: string
): Promise<Map<string, GroupTableRef>> {
  const { data } = await client.from("tables").select("id, name, group_session_id").eq("tenant_id", tenantId);
  return new Map(
    (data ?? []).map((t) => [
      t.id as string,
      { id: t.id as string, name: t.name as string, group_session_id: (t.group_session_id as string | null) ?? null },
    ])
  );
}

/**
 * Tên bàn kiểu HÓA ĐƠN cho một phiên — "B1 +4" khi phiên là nhóm (QD-029 D4), "B1" khi không. Đếm cả bàn gọi của
 * các đơn trong phiên để in lại sau khi phiên đóng vẫn đúng. `null` khi không tra ra phiên/bàn.
 */
export async function sessionGroupName(
  client: SupabaseClient,
  tenantId: string,
  sessionId: string
): Promise<string | null> {
  const [{ data: sess }, { data: orders }, refs] = await Promise.all([
    client.from("table_sessions").select("table_id").eq("tenant_id", tenantId).eq("id", sessionId).maybeSingle(),
    client.from("orders").select("table_id").eq("tenant_id", tenantId).eq("table_session_id", sessionId),
    loadGroupRefs(client, tenantId),
  ]);
  if (!sess) return null;
  return groupTableName({
    sessionId,
    mainTableId: sess.table_id as string,
    orderTableIds: (orders ?? []).map((o) => (o.table_id as string | null) ?? null),
    tables: refs,
  });
}
