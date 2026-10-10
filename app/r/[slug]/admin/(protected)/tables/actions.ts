"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { setFlash } from "@/lib/flash";
import {
  MAX_BULK,
  NAME_MAX,
  bulkNames,
  clampSeats,
  listShort,
  nameKey,
  parseImportRows,
  splitDuplicates,
} from "@/lib/tables/bulk";
import { readFirstSheet } from "@/lib/tables/xlsx-doc";
import { thuTuHopLe } from "@/lib/menu/reorder";

// Các action dưới đây cập nhật TẠI CHỖ: revalidatePath + toast (setFlash), KHÔNG
// redirect(?ok/?error) → URL giữ nguyên /admin/tables. Kéo thả (P38) báo "Đã lưu thứ tự".

async function requireTableManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "tables")) {
    redirect(`/r/${slug}/admin/tables?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

function tablesPath(slug: string) {
  return `/r/${slug}/admin/tables`;
}

/**
 * Ghi cả thứ tự sau kéo thả (P38): `ids` phải đúng bằng tập hàng hiện có trong scope (`thuTuHopLe`) — máy khác vừa
 * thêm/xóa thì từ chối, không ghi nửa vời. Gán `sort_order` = vị trí (0..n-1), chỉ ghi hàng đổi chỗ.
 */
async function saveOrder(
  table: "areas" | "tables",
  scope: Record<string, string | null>,
  tenantId: string,
  ids: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  let q = supabase.from(table).select("id, sort_order").eq("tenant_id", tenantId);
  for (const [k, v] of Object.entries(scope)) {
    q = v === null ? q.is(k, null) : q.eq(k, v);
  }
  const { data: rows, error } = await q;
  if (error) return { ok: false, error: error.message };
  if (!thuTuHopLe((rows ?? []).map((r) => r.id as string), ids)) {
    return { ok: false, error: "Danh sách vừa thay đổi ở máy khác. Tải lại trang rồi sắp xếp lại." };
  }
  const cu = new Map((rows ?? []).map((r) => [r.id as string, r.sort_order as number]));
  const results = await Promise.all(
    ids
      .map((id, i) => ({ id, i }))
      .filter(({ id, i }) => cu.get(id) !== i)
      .map(({ id, i }) => supabase.from(table).update({ sort_order: i }).eq("id", id).eq("tenant_id", tenantId))
  );
  const loi = results.find((r) => r.error)?.error;
  return loi ? { ok: false, error: loi.message } : { ok: true };
}

// ---- Khu vực ----------------------------------------------------------------

export async function createArea(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("areas")
    .select("sort_order")
    .eq("tenant_id", session.tenant.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("areas")
    .insert({ tenant_id: session.tenant.id, name, sort_order });
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã thêm khu vực "${name}".`);
}

export async function renameArea(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("areas")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : "Đã đổi tên khu vực.");
}

export async function deleteArea(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");

  // Bàn thuộc khu vực này → area_id set null (FK on delete set null), không mất bàn.
  const supabase = await createClient();
  const { error } = await supabase
    .from("areas")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : "Đã xóa khu vực.");
}

/** Kéo thả khu vực (P38): `ids` = mọi khu vực của quán theo thứ tự mới. */
export async function reorderAreas(
  slug: string,
  ids: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireTableManager(slug);
  const r = await saveOrder("areas", {}, session.tenant.id, ids);
  revalidatePath(tablesPath(slug));
  await setFlash(r.ok ? "ok" : "error", r.ok ? "Đã lưu thứ tự." : r.error);
  return r;
}

// ---- Bàn --------------------------------------------------------------------

export async function createTable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const name = String(formData.get("name") ?? "").trim();
  const areaRaw = String(formData.get("area_id") ?? "");
  const area_id = areaRaw ? areaRaw : null;
  const seats = Math.max(1, parseInt(String(formData.get("seats") ?? "2"), 10) || 2);
  if (!name) return;

  const supabase = await createClient();
  const sort_order = await nextTableSort(session.tenant.id, area_id);

  // qr_token do DB default sinh (encode(gen_random_bytes(9),'hex')).
  const { error } = await supabase
    .from("tables")
    .insert({ tenant_id: session.tenant.id, area_id, name, seats, sort_order });
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã thêm bàn "${name}".`);
}

export async function updateTable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const areaRaw = String(formData.get("area_id") ?? "");
  const area_id = areaRaw ? areaRaw : null;
  const seats = Math.max(1, parseInt(String(formData.get("seats") ?? "2"), 10) || 2);
  if (!name) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("tables")
    .update({ name, area_id, seats, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : "Đã lưu bàn.");
}

export async function deleteTable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tables")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : "Đã xóa bàn.");
}

/** sort_order kế tiếp cho bàn mới trong một khu (null = "Chưa xếp khu"). */
async function nextTableSort(tenantId: string, area_id: string | null): Promise<number> {
  const supabase = await createClient();
  let q = supabase.from("tables").select("sort_order").eq("tenant_id", tenantId);
  q = area_id === null ? q.is("area_id", null) : q.eq("area_id", area_id);
  const { data: last } = await q.order("sort_order", { ascending: false }).limit(1).maybeSingle();
  return (last?.sort_order ?? -1) + 1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Danh sách id bàn từ ô ẩn "ids" (phân cách dấu phẩy) — chỉ giữ uuid hợp lệ, tối đa 500. */
function parseIds(formData: FormData): string[] {
  return String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID.test(s))
    .slice(0, 500);
}

// ---- Nhiều bàn (P36) ----------------------------------------------------------

/** "Thêm hàng loạt" (TABLE-07): Bàn 1 … Bàn N vào một khu, bỏ qua tên trùng với bàn đã có trong khu. */
export async function createTablesBulk(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const areaRaw = String(formData.get("area_id") ?? "");
  const area_id = areaRaw ? areaRaw : null;
  const prefix = String(formData.get("prefix") ?? "").slice(0, NAME_MAX);
  const start = Math.max(0, parseInt(String(formData.get("start") ?? "1"), 10) || 0);
  const count = parseInt(String(formData.get("count") ?? "0"), 10) || 0;
  const seats = clampSeats(formData.get("seats"));
  if (count < 1 || count > MAX_BULK) {
    await setFlash("error", `Số lượng phải từ 1 đến ${MAX_BULK}.`);
    return;
  }

  const supabase = await createClient();
  let q = supabase.from("tables").select("name").eq("tenant_id", session.tenant.id);
  q = area_id === null ? q.is("area_id", null) : q.eq("area_id", area_id);
  const { data: existing } = await q;
  const { create, skipped } = splitDuplicates(
    bulkNames(prefix, start, count),
    (existing ?? []).map((t) => t.name as string)
  );

  let error: { message: string } | null = null;
  if (create.length > 0) {
    const base = await nextTableSort(session.tenant.id, area_id);
    ({ error } = await supabase.from("tables").insert(
      create.map((name, i) => ({ tenant_id: session.tenant.id, area_id, name, seats, sort_order: base + i }))
    ));
  }
  revalidatePath(tablesPath(slug));
  if (error) return setFlash("error", error.message);
  const skip = skipped.length ? ` Bỏ qua ${skipped.length} bàn trùng tên: ${listShort(skipped)}.` : "";
  await setFlash(create.length ? "ok" : "error", `Đã thêm ${create.length} bàn.${skip}`);
}

/** "Nhập Excel" (TABLE-08): file theo mẫu Tên bàn · Khu vực · Số ghế; khu chưa có thì tạo. */
export async function importTables(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const file = formData.get("file");
  const bad = "File không đọc được. Hãy dùng file mẫu.";
  if (!(file instanceof File) || file.size === 0) return setFlash("error", "Chưa chọn file.");
  if (file.size > 2 * 1024 * 1024) return setFlash("error", "File quá lớn (tối đa 2MB).");

  let sheet: string[][];
  try {
    sheet = readFirstSheet(Buffer.from(await file.arrayBuffer()));
  } catch {
    return setFlash("error", bad);
  }
  const parsed = parseImportRows(sheet);
  if (!parsed.ok) return setFlash("error", parsed.error);

  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const [{ data: areas }, { data: tables }] = await Promise.all([
    supabase.from("areas").select("id, name, sort_order").eq("tenant_id", tenantId),
    supabase.from("tables").select("name, area_id, sort_order").eq("tenant_id", tenantId),
  ]);

  // Khu theo tên (không phân biệt hoa thường); khu chưa có → tạo một lần cho cả file.
  const areaByKey = new Map((areas ?? []).map((a) => [nameKey(a.name as string), a.id as string]));
  const newAreaNames: string[] = [];
  for (const r of parsed.rows) {
    const k = nameKey(r.area);
    if (k && !areaByKey.has(k) && !newAreaNames.some((n) => nameKey(n) === k)) newAreaNames.push(r.area);
  }
  if (newAreaNames.length > 0) {
    const baseArea = Math.max(-1, ...(areas ?? []).map((a) => a.sort_order as number)) + 1;
    const { data: created, error } = await supabase
      .from("areas")
      .insert(newAreaNames.map((name, i) => ({ tenant_id: tenantId, name, sort_order: baseArea + i })))
      .select("id, name");
    if (error) {
      revalidatePath(tablesPath(slug));
      return setFlash("error", error.message);
    }
    for (const a of created ?? []) areaByKey.set(nameKey(a.name as string), a.id as string);
  }

  // Trùng tên xét trong từng khu: với bàn đã có và với dòng đứng trước trong file.
  const namesByArea = new Map<string | null, Set<string>>();
  const sortByArea = new Map<string | null, number>();
  for (const t of tables ?? []) {
    const a = (t.area_id as string | null) ?? null;
    if (!namesByArea.has(a)) namesByArea.set(a, new Set());
    namesByArea.get(a)!.add(nameKey(t.name as string));
    sortByArea.set(a, Math.max(sortByArea.get(a) ?? -1, t.sort_order as number));
  }
  const skipped = parsed.skipped.map((s) => `dòng ${s.line} ${s.reason}`);
  const rows: { tenant_id: string; area_id: string | null; name: string; seats: number; sort_order: number }[] = [];
  for (const r of parsed.rows) {
    const area_id = r.area ? areaByKey.get(nameKey(r.area))! : null;
    const names = namesByArea.get(area_id) ?? new Set<string>();
    namesByArea.set(area_id, names);
    if (names.has(nameKey(r.name))) {
      skipped.push(`dòng ${r.line} trùng tên ${r.name}`);
      continue;
    }
    names.add(nameKey(r.name));
    const sort_order = (sortByArea.get(area_id) ?? -1) + 1;
    sortByArea.set(area_id, sort_order);
    rows.push({ tenant_id: tenantId, area_id, name: r.name, seats: r.seats, sort_order });
  }

  const { error } = rows.length ? await supabase.from("tables").insert(rows) : { error: null };
  revalidatePath(tablesPath(slug));
  if (error) return setFlash("error", error.message);
  const parts = [`Đã nhập ${rows.length} bàn`];
  if (newAreaNames.length) parts.push(`tạo khu mới: ${newAreaNames.join(", ")}`);
  let msg = parts.join(", ") + ".";
  if (skipped.length) {
    const shown = skipped.slice(0, 5).join(", ");
    msg += ` Bỏ qua ${skipped.length} dòng: ${shown}${skipped.length > 5 ? "…" : ""}.`;
  }
  await setFlash(rows.length ? "ok" : "error", msg);
}

/** Chuyển nhiều bàn sang một khu (TABLE-09) — nối vào cuối khu đích, giữ thứ tự đang chọn. */
export async function moveTables(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const ids = parseIds(formData);
  const areaRaw = String(formData.get("area_id") ?? "");
  const area_id = areaRaw ? areaRaw : null;
  if (ids.length === 0) return;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("tables")
    .select("id, tenant_id, name, area_id, sort_order")
    .eq("tenant_id", session.tenant.id)
    .in("id", ids)
    .order("sort_order", { ascending: true });
  const moving = (rows ?? []).filter((t) => (t.area_id ?? null) !== area_id);
  let error: { message: string } | null = null;
  if (moving.length > 0) {
    const base = await nextTableSort(session.tenant.id, area_id);
    const now = new Date().toISOString();
    // Một request: upsert theo id (mọi id đã lọc đúng quán ở trên) — chỉ cập nhật các cột gửi lên.
    ({ error } = await supabase.from("tables").upsert(
      moving.map((t, i) => ({
        id: t.id,
        tenant_id: t.tenant_id,
        name: t.name,
        area_id,
        sort_order: base + i,
        updated_at: now,
      })),
      { onConflict: "id" }
    ));
  }
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã chuyển ${moving.length} bàn.`);
}

/** Đổi số ghế nhiều bàn (TABLE-09). */
export async function setTablesSeats(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const ids = parseIds(formData);
  const seats = clampSeats(formData.get("seats"));
  if (ids.length === 0) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .update({ seats, updated_at: new Date().toISOString() })
    .eq("tenant_id", session.tenant.id)
    .in("id", ids)
    .select("id");
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã đổi ${data?.length ?? 0} bàn sang ${seats} ghế.`);
}

/** Xóa nhiều bàn (TABLE-09) — như xóa từng bàn: mã QR của các bàn mất hiệu lực. */
export async function deleteTables(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const ids = parseIds(formData);
  if (ids.length === 0) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tables")
    .delete()
    .eq("tenant_id", session.tenant.id)
    .in("id", ids)
    .select("id");
  revalidatePath(tablesPath(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã xóa ${data?.length ?? 0} bàn.`);
}

/** Kéo thả bàn trong một khu (P38): `ids` = mọi bàn của khu (`areaId` null = "Chưa xếp khu") theo thứ tự mới. */
export async function reorderTables(
  slug: string,
  areaId: string | null,
  ids: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireTableManager(slug);
  const r = await saveOrder("tables", { area_id: areaId }, session.tenant.id, ids);
  revalidatePath(tablesPath(slug));
  await setFlash(r.ok ? "ok" : "error", r.ok ? "Đã lưu thứ tự." : r.error);
  return r;
}
