"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";

// Các action dưới đây cập nhật TẠI CHỖ: chỉ revalidatePath, KHÔNG redirect(?ok/?error)
// → URL giữ nguyên /admin/tables; thay đổi hiện ngay trên danh sách. Trường bắt buộc
// đã có `required` ở input nên bỏ qua thao tác nếu thiếu (không tạo dữ liệu rác).

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

/** Hoán đổi sort_order với hàng liền kề (cùng scope). Chỉ ghi 2 hàng. */
async function moveInList(
  table: "areas" | "tables",
  scope: Record<string, string | null>,
  tenantId: string,
  id: string,
  dir: "up" | "down"
) {
  const supabase = await createClient();
  let q = supabase.from(table).select("id, sort_order").eq("tenant_id", tenantId);
  for (const [k, v] of Object.entries(scope)) {
    q = v === null ? q.is(k, null) : q.eq(k, v);
  }
  const { data: rows } = await q
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!rows) return;

  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;

  const a = rows[idx];
  const b = rows[swapIdx];
  const aOrder = a.sort_order === b.sort_order ? idx : a.sort_order;
  const bOrder = a.sort_order === b.sort_order ? swapIdx : b.sort_order;
  await supabase.from(table).update({ sort_order: bOrder }).eq("id", a.id).eq("tenant_id", tenantId);
  await supabase.from(table).update({ sort_order: aOrder }).eq("id", b.id).eq("tenant_id", tenantId);
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

  await supabase.from("areas").insert({ tenant_id: session.tenant.id, name, sort_order });
  revalidatePath(tablesPath(slug));
}

export async function renameArea(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase
    .from("areas")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
}

export async function deleteArea(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");

  // Bàn thuộc khu vực này → area_id set null (FK on delete set null), không mất bàn.
  const supabase = await createClient();
  await supabase.from("areas").delete().eq("id", id).eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
}

export async function reorderArea(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "up") === "down" ? "down" : "up";

  await moveInList("areas", {}, session.tenant.id, id, dir);
  revalidatePath(tablesPath(slug));
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
  let q = supabase.from("tables").select("sort_order").eq("tenant_id", session.tenant.id);
  q = area_id === null ? q.is("area_id", null) : q.eq("area_id", area_id);
  const { data: last } = await q
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  // qr_token do DB default sinh (encode(gen_random_bytes(9),'hex')).
  await supabase
    .from("tables")
    .insert({ tenant_id: session.tenant.id, area_id, name, seats, sort_order });
  revalidatePath(tablesPath(slug));
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
  await supabase
    .from("tables")
    .update({ name, area_id, seats, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
}

export async function deleteTable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase.from("tables").delete().eq("id", id).eq("tenant_id", session.tenant.id);
  revalidatePath(tablesPath(slug));
}

export async function reorderTable(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireTableManager(slug);
  const id = String(formData.get("id") ?? "");
  const areaRaw = String(formData.get("area_id") ?? "");
  const area_id = areaRaw ? areaRaw : null;
  const dir = String(formData.get("dir") ?? "up") === "down" ? "down" : "up";

  await moveInList("tables", { area_id }, session.tenant.id, id, dir);
  revalidatePath(tablesPath(slug));
}
