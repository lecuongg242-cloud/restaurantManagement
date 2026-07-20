"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2MB (MENU-01)
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function tenantIdFromSlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id as string | undefined;
}

const backMenu = (slug: string, q = ""): never =>
  redirect(`/r/${slug}/admin/menu${q}`);
const backItem = (slug: string, itemId: string, q = ""): never =>
  redirect(`/r/${slug}/admin/menu/${itemId}${q}`);
const err = (msg: string) => "?err=" + encodeURIComponent(msg);

/** "45.000" | "45000" → 45000; NaN/âm → null (CHECK ở DB là chốt chặn cuối). */
function parsePrice(raw: FormDataEntryValue | null): number | null {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

// ---------------------------------------------------------------------
// Danh mục
// ---------------------------------------------------------------------

export async function createCategory(formData: FormData) {
  const slug = String(formData.get("slug"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) backMenu(slug, err("Tên danh mục không được để trống."));
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) backMenu(slug, err("Không tìm thấy nhà hàng."));

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_categories")
    .insert({ tenant_id: tenantId, name });
  if (error) backMenu(slug, err("Không tạo được danh mục: " + error.message));
  backMenu(slug);
}

export async function renameCategory(formData: FormData) {
  const slug = String(formData.get("slug"));
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) backMenu(slug, err("Tên danh mục không được để trống."));

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_categories")
    .update({ name })
    .eq("id", id);
  if (error) backMenu(slug, err(error.message));
  backMenu(slug);
}

export async function deleteCategory(formData: FormData) {
  const slug = String(formData.get("slug"));
  const id = String(formData.get("id"));
  const supabase = await createClient();
  // Món trong danh mục bị xóa theo (FK on delete cascade) — UI đã hỏi xác nhận.
  const { error } = await supabase.from("menu_categories").delete().eq("id", id);
  if (error) backMenu(slug, err(error.message));
  backMenu(slug);
}

// ---------------------------------------------------------------------
// Món
// ---------------------------------------------------------------------

export async function quickAddItem(formData: FormData) {
  const slug = String(formData.get("slug"));
  const categoryId = String(formData.get("category_id"));
  const name = String(formData.get("name") ?? "").trim();
  const price = parsePrice(formData.get("price"));
  if (!name || price === null) {
    backMenu(slug, err("Cần tên món và giá hợp lệ (số, không âm)."));
  }
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) backMenu(slug, err("Không tìm thấy nhà hàng."));

  const supabase = await createClient();
  const { error } = await supabase.from("menu_items").insert({
    tenant_id: tenantId,
    category_id: categoryId,
    name,
    price,
  });
  if (error) backMenu(slug, err("Không tạo được món: " + error.message));
  backMenu(slug);
}

export async function updateItem(formData: FormData) {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("item_id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("category_id"));
  const price = parsePrice(formData.get("price"));
  const isActive = formData.get("is_active") === "on";
  if (!name || price === null) {
    backItem(slug, itemId, err("Cần tên món và giá hợp lệ (số, không âm)."));
  }
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) backMenu(slug, err("Không tìm thấy nhà hàng."));

  const supabase = await createClient();

  // Ảnh (tùy chọn): chặn ở client → server → CẤU HÌNH BUCKET (cam kết #2)
  let imageUrl: string | undefined;
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    if (image.size > IMAGE_MAX_BYTES) {
      backItem(slug, itemId, err("Ảnh vượt 2MB — hãy chọn ảnh nhỏ hơn."));
    }
    const ext = IMAGE_TYPES[image.type];
    if (!ext) {
      backItem(slug, itemId, err("Chỉ nhận ảnh JPG, PNG hoặc WEBP."));
    }
    const path = `${tenantId}/${itemId}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("menu-images")
      .upload(path, image, { upsert: true, contentType: image.type });
    if (upErr) {
      backItem(slug, itemId, err("Không tải được ảnh: " + upErr.message));
    }
    const { data: pub } = supabase.storage.from("menu-images").getPublicUrl(path);
    imageUrl = `${pub.publicUrl}?v=${Date.now()}`; // bust cache khi thay ảnh
  }

  const { error } = await supabase
    .from("menu_items")
    .update({
      name,
      description,
      category_id: categoryId,
      price,
      is_active: isActive,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    })
    .eq("id", itemId);
  if (error) backItem(slug, itemId, err(error.message));
  backItem(slug, itemId, "?ok=1");
}

export async function deleteItem(formData: FormData) {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("item_id"));
  const supabase = await createClient();
  const { error } = await supabase.from("menu_items").delete().eq("id", itemId);
  if (error) backMenu(slug, err(error.message));
  backMenu(slug);
}

/** Toggle "hết món" 1 chạm (MENU-02) — app khách phản ánh realtime ≤ 3s. */
export async function setSoldOut(formData: FormData) {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("item_id"));
  const soldOut = String(formData.get("sold_out")) === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_items")
    .update({ is_sold_out: soldOut })
    .eq("id", itemId);
  if (error) backMenu(slug, err(error.message));
  backMenu(slug);
}

// ---------------------------------------------------------------------
// Tùy chọn món (size/topping)
// ---------------------------------------------------------------------

export async function addOptionGroup(formData: FormData) {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("item_id"));
  const name = String(formData.get("name") ?? "").trim();
  const selection = String(formData.get("selection")) === "multiple" ? "multiple" : "single";
  const isRequired = formData.get("is_required") === "on";
  if (!name) backItem(slug, itemId, err("Tên nhóm tùy chọn không được trống."));
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) backMenu(slug, err("Không tìm thấy nhà hàng."));

  const supabase = await createClient();
  const { error } = await supabase.from("menu_option_groups").insert({
    tenant_id: tenantId,
    item_id: itemId,
    name,
    selection,
    is_required: isRequired,
  });
  if (error) backItem(slug, itemId, err(error.message));
  backItem(slug, itemId);
}

export async function deleteOptionGroup(formData: FormData) {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("item_id"));
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_option_groups")
    .delete()
    .eq("id", id);
  if (error) backItem(slug, itemId, err(error.message));
  backItem(slug, itemId);
}

export async function addOption(formData: FormData) {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("item_id"));
  const groupId = String(formData.get("group_id"));
  const name = String(formData.get("name") ?? "").trim();
  const priceDelta = parsePrice(formData.get("price_delta")) ?? 0;
  if (!name) backItem(slug, itemId, err("Tên lựa chọn không được trống."));
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) backMenu(slug, err("Không tìm thấy nhà hàng."));

  const supabase = await createClient();
  const { error } = await supabase.from("menu_options").insert({
    tenant_id: tenantId,
    group_id: groupId,
    name,
    price_delta: priceDelta,
  });
  if (error) backItem(slug, itemId, err(error.message));
  backItem(slug, itemId);
}

export async function deleteOption(formData: FormData) {
  const slug = String(formData.get("slug"));
  const itemId = String(formData.get("item_id"));
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("menu_options").delete().eq("id", id);
  if (error) backItem(slug, itemId, err(error.message));
  backItem(slug, itemId);
}
