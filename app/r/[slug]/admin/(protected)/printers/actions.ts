"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { setFlash } from "@/lib/flash";
import { DEFAULT_STATION_NAME, MAX_COPIES, STATION_NAME_MAX } from "@/lib/print/stations";

// Bếp/bar (P37, PRINT-19). Ghi tại chỗ + toast như trang Bàn & QR; RLS 0087 chỉ cho chủ quán / quản lý ghi.

async function requirePrinterManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "printers")) {
    redirect(`/r/${slug}/admin?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

const path = (slug: string) => `/r/${slug}/admin/printers`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Thêm / sửa bếp/bar. `id`: "" = thêm mới, "default" = Bếp chính (tạo dòng lần đầu lưu), uuid = sửa. Nhóm món tích ở đây
 * chuyển về nơi này (kể cả đang ở nơi khác); nhóm bỏ tích về Bếp chính. Bếp chính không chọn nhóm (nhận phần còn lại).
 */
export async function saveStation(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requirePrinterManager(slug);
  const tenantId = session.tenant.id;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, STATION_NAME_MAX);
  const copies = Math.min(MAX_COPIES, Math.max(1, parseInt(String(formData.get("copies") ?? "1"), 10) || 1));
  const per_item = formData.get("per_item") === "on";
  const categoryIds = formData.getAll("category_ids").map(String).filter((c) => UUID.test(c));
  if (!name) return setFlash("error", "Nhập tên bếp/bar.");

  const supabase = await createClient();
  const now = new Date().toISOString();
  let stationId: string;

  if (id === "default") {
    const { data: def } = await supabase
      .from("kitchen_stations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_default", true)
      .maybeSingle();
    const { error } = def
      ? await supabase.from("kitchen_stations").update({ name, copies, per_item, updated_at: now }).eq("id", def.id).eq("tenant_id", tenantId)
      : await supabase.from("kitchen_stations").insert({ tenant_id: tenantId, name, copies, per_item, is_default: true, sort_order: 0 });
    revalidatePath(path(slug));
    return setFlash(error ? "error" : "ok", error ? error.message : `Đã lưu "${name}".`);
  }

  if (id === "") {
    const { data: last } = await supabase
      .from("kitchen_stations")
      .select("sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("kitchen_stations")
      .insert({ tenant_id: tenantId, name, copies, per_item, sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error || !data) {
      revalidatePath(path(slug));
      return setFlash("error", error?.message ?? "Không thêm được bếp/bar.");
    }
    stationId = data.id as string;
  } else {
    if (!UUID.test(id)) return;
    const { error } = await supabase
      .from("kitchen_stations")
      .update({ name, copies, per_item, updated_at: now })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("is_default", false);
    if (error) {
      revalidatePath(path(slug));
      return setFlash("error", error.message);
    }
    stationId = id;
  }

  // Nhóm bỏ tích → về Bếp chính; nhóm tích → về nơi này.
  let q = supabase.from("menu_categories").update({ station_id: null }).eq("tenant_id", tenantId).eq("station_id", stationId);
  if (categoryIds.length) q = q.not("id", "in", `(${categoryIds.join(",")})`);
  const { error: e1 } = await q;
  const { error: e2 } = categoryIds.length
    ? await supabase.from("menu_categories").update({ station_id: stationId }).eq("tenant_id", tenantId).in("id", categoryIds)
    : { error: null };
  revalidatePath(path(slug));
  const err = e1 ?? e2;
  await setFlash(err ? "error" : "ok", err ? err.message : `Đã lưu "${name}" · ${categoryIds.length} nhóm món.`);
}

/** Xóa bếp/bar (không xóa được Bếp chính). Nhóm món của nó về Bếp chính (khóa ngoại ON DELETE SET NULL). */
export async function deleteStation(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requirePrinterManager(slug);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("kitchen_stations")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .eq("is_default", false);
  revalidatePath(path(slug));
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã xóa bếp/bar. Nhóm món của nó in ra ${DEFAULT_STATION_NAME}.`);
}
