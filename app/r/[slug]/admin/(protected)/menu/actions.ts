"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import {
  validateImage,
  uploadMenuImage,
  deleteMenuImage,
  pathFromPublicUrl,
} from "@/lib/storage/images";

// Các action cập nhật TẠI CHỖ: chỉ revalidatePath, KHÔNG redirect(?ok/?error) → URL
// giữ nguyên /admin/menu; thay đổi hiện ngay trên danh sách. Trường bắt buộc có `required`
// nên bỏ qua nếu thiếu (không tạo dữ liệu rác).

/** Guard chung: chỉ owner/manager quản lý menu của tenant theo slug. */
async function requireMenuManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "menu")) {
    redirect(`/r/${slug}/admin/menu?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

function menuPath(slug: string) {
  return `/r/${slug}/admin/menu`;
}

/**
 * Đổi thứ tự một hàng trong danh sách anh em (cùng scope): đọc id theo sort_order,
 * hoán đổi sort_order với hàng liền kề theo `dir`. Chỉ ghi 2 hàng đổi chỗ.
 */
async function moveInList(
  table: "menu_categories" | "menu_items",
  scope: Record<string, string>,
  tenantId: string,
  id: string,
  dir: "up" | "down"
) {
  const supabase = await createClient();
  let q = supabase.from(table).select("id, sort_order").eq("tenant_id", tenantId);
  for (const [k, v] of Object.entries(scope)) q = q.eq(k, v);
  const { data: rows } = await q.order("sort_order", { ascending: true }).order("created_at", {
    ascending: true,
  });
  if (!rows) return;

  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;

  const a = rows[idx];
  const b = rows[swapIdx];
  // Nếu sort_order trùng nhau (dữ liệu cũ), gán lại theo vị trí để đảm bảo đổi thật.
  const aOrder = a.sort_order === b.sort_order ? idx : a.sort_order;
  const bOrder = a.sort_order === b.sort_order ? swapIdx : b.sort_order;
  await supabase.from(table).update({ sort_order: bOrder }).eq("id", a.id).eq("tenant_id", tenantId);
  await supabase.from(table).update({ sort_order: aOrder }).eq("id", b.id).eq("tenant_id", tenantId);
}

// ---- Danh mục ---------------------------------------------------------------

export async function createCategory(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  // sort_order = max + 1 để danh mục mới xuống cuối.
  const { data: last } = await supabase
    .from("menu_categories")
    .select("sort_order")
    .eq("tenant_id", session.tenant.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  await supabase
    .from("menu_categories")
    .insert({ tenant_id: session.tenant.id, name, sort_order });
  revalidatePath(menuPath(slug));
}

export async function renameCategory(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase
    .from("menu_categories")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(menuPath(slug));
}

export async function deleteCategory(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase
    .from("menu_categories")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(menuPath(slug));
}

export async function reorderCategory(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "up") === "down" ? "down" : "up";

  await moveInList("menu_categories", {}, session.tenant.id, id, dir);
  revalidatePath(menuPath(slug));
}

// ---- Món --------------------------------------------------------------------

/**
 * Đồng bộ nhóm tùy chọn gắn vào món (N-N) theo danh sách group_ids submit từ
 * ModifierGroupPicker: xóa link không còn, thêm link mới. Scope tenant.
 */
async function syncItemGroups(
  tenantId: string,
  itemId: string,
  groupIds: string[]
) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("menu_item_modifier_groups")
    .select("group_id")
    .eq("tenant_id", tenantId)
    .eq("item_id", itemId);
  const have = new Set((existing ?? []).map((r) => r.group_id as string));
  const want = new Set(groupIds);

  const toDelete = [...have].filter((g) => !want.has(g));
  const toInsert = [...want].filter((g) => !have.has(g));

  if (toDelete.length) {
    await supabase
      .from("menu_item_modifier_groups")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .in("group_id", toDelete);
  }
  if (toInsert.length) {
    await supabase.from("menu_item_modifier_groups").insert(
      toInsert.map((group_id) => ({ tenant_id: tenantId, item_id: itemId, group_id }))
    );
  }
}

/** Đọc field món chung từ FormData (dùng cho create + update). */
function readItemFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "");
  const priceRaw = String(formData.get("base_price") ?? "").replace(/[^\d]/g, "");
  const base_price = priceRaw ? parseInt(priceRaw, 10) : 0;
  return { name, description, category_id, base_price };
}

export async function createItem(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const { name, description, category_id, base_price } = readItemFields(formData);

  if (!name || !category_id || !Number.isFinite(base_price) || base_price < 0) return;

  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const v = validateImage(image);
    if (!v.ok) return;
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("menu_items")
    .select("sort_order")
    .eq("tenant_id", session.tenant.id)
    .eq("category_id", category_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("menu_items")
    .insert({
      tenant_id: session.tenant.id,
      category_id,
      name,
      description: description || null,
      base_price,
      sort_order,
    })
    .select("id")
    .single();
  if (error || !inserted) return;

  // Ảnh (nếu có): upload rồi cập nhật image_url. Lỗi ảnh không chặn (giữ món, bỏ ảnh).
  if (image instanceof File && image.size > 0) {
    try {
      const { publicUrl } = await uploadMenuImage(session.tenant.id, inserted.id, image);
      await supabase
        .from("menu_items")
        .update({ image_url: publicUrl })
        .eq("id", inserted.id)
        .eq("tenant_id", session.tenant.id);
    } catch {
      // bỏ qua lỗi ảnh
    }
  }

  if (formData.get("group_picker") === "1") {
    await syncItemGroups(
      session.tenant.id,
      inserted.id,
      formData.getAll("group_ids").map(String)
    );
  }

  revalidatePath(menuPath(slug));
}

export async function updateItem(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const { name, description, category_id, base_price } = readItemFields(formData);

  if (!name || !category_id || base_price < 0) return;

  const supabase = await createClient();
  const image = formData.get("image");
  let image_url: string | undefined;

  if (image instanceof File && image.size > 0) {
    const v = validateImage(image);
    if (!v.ok) return;
    // Ảnh cũ để xóa sau khi thay.
    const { data: current } = await supabase
      .from("menu_items")
      .select("image_url")
      .eq("id", id)
      .eq("tenant_id", session.tenant.id)
      .maybeSingle();
    try {
      const { publicUrl } = await uploadMenuImage(session.tenant.id, id, image);
      image_url = publicUrl;
      await deleteMenuImage(pathFromPublicUrl(current?.image_url ?? null));
    } catch {
      // bỏ qua lỗi ảnh; vẫn lưu các field khác
    }
  }

  await supabase
    .from("menu_items")
    .update({
      name,
      description: description || null,
      category_id,
      base_price,
      ...(image_url ? { image_url } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);

  if (formData.get("group_picker") === "1") {
    await syncItemGroups(
      session.tenant.id,
      id,
      formData.getAll("group_ids").map(String)
    );
  }

  revalidatePath(menuPath(slug));
}

export async function deleteItem(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("menu_items")
    .select("image_url")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  await supabase.from("menu_items").delete().eq("id", id).eq("tenant_id", session.tenant.id);

  await deleteMenuImage(pathFromPublicUrl(current?.image_url ?? null));
  revalidatePath(menuPath(slug));
}

export async function reorderItem(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const category_id = String(formData.get("category_id") ?? "");
  const dir = String(formData.get("dir") ?? "up") === "down" ? "down" : "up";

  await moveInList("menu_items", { category_id }, session.tenant.id, id, dir);
  revalidatePath(menuPath(slug));
}

/** Bật/tắt "hết món" — tối ưu cho toggle optimistic (không redirect). */
export async function setItemAvailable(slug: string, id: string, available: boolean) {
  const session = await requireMenuManager(slug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_items")
    .update({ is_available: available, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) throw new Error(error.message);
  revalidatePath(menuPath(slug));
}
