"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
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

const back = (slug: string, step: number, q = ""): never =>
  redirect(`/r/${slug}/admin/onboarding?step=${step}${q}`);
const err = (msg: string) => "&err=" + encodeURIComponent(msg);
const ok = (msg: string) => "&ok=" + encodeURIComponent(msg);

/** Bước 1: tên, logo, địa chỉ/SĐT hiển thị trên menu khách. */
export async function saveRestaurantInfo(formData: FormData) {
  const slug = String(formData.get("slug"));
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!name) back(slug, 1, err("Tên nhà hàng không được để trống."));
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) redirect("/choose");

  const supabase = await createClient();

  let logoUrl: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > IMAGE_MAX_BYTES) back(slug, 1, err("Logo vượt 2MB."));
    const ext = IMAGE_TYPES[logo.type];
    if (!ext) back(slug, 1, err("Logo chỉ nhận JPG, PNG hoặc WEBP."));
    const path = `${tenantId}/logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("menu-images")
      .upload(path, logo, { upsert: true, contentType: logo.type });
    if (upErr) back(slug, 1, err("Không tải được logo: " + upErr.message));
    const { data: pub } = supabase.storage.from("menu-images").getPublicUrl(path);
    logoUrl = `${pub.publicUrl}?v=${Date.now()}`;
  }

  const { error } = await supabase
    .from("tenants")
    .update({ name, address, phone, ...(logoUrl ? { logo_url: logoUrl } : {}) })
    .eq("id", tenantId);
  if (error) back(slug, 1, err(error.message));
  back(slug, 2);
}

/**
 * Bước 2: menu nhanh — 1 danh mục + mỗi dòng "Tên món, giá".
 * Mục tiêu 10 món < 5 phút (thiết kế P2 §6).
 */
export async function quickMenu(formData: FormData) {
  const slug = String(formData.get("slug"));
  const categoryName = String(formData.get("category") ?? "").trim();
  const linesRaw = String(formData.get("lines") ?? "");
  if (!categoryName) back(slug, 2, err("Cần tên danh mục."));

  const lines = linesRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const items: { name: string; price: number }[] = [];
  const bad: string[] = [];
  for (const line of lines) {
    const at = line.lastIndexOf(",");
    const name = at > 0 ? line.slice(0, at).trim() : "";
    const digits = (at > 0 ? line.slice(at + 1) : "").replace(/[^\d]/g, "");
    if (name && digits) items.push({ name, price: Number(digits) });
    else bad.push(line);
  }
  if (bad.length > 0) {
    back(
      slug, 2,
      err(`Dòng sai định dạng (cần "Tên món, giá"): ${bad.slice(0, 3).join(" · ")}`)
    );
  }
  if (items.length === 0) back(slug, 2, err("Chưa có dòng món nào hợp lệ."));

  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) redirect("/choose");
  const supabase = await createClient();

  // Dùng lại danh mục trùng tên nếu có, không tạo bản sao
  const { data: existing } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("name", categoryName)
    .maybeSingle();
  let categoryId = existing?.id as string | undefined;
  if (!categoryId) {
    const { data: created, error } = await supabase
      .from("menu_categories")
      .insert({ tenant_id: tenantId, name: categoryName })
      .select("id")
      .single();
    if (error) back(slug, 2, err(error.message));
    categoryId = created!.id;
  }

  const { error } = await supabase.from("menu_items").insert(
    items.map((i) => ({
      tenant_id: tenantId,
      category_id: categoryId,
      name: i.name,
      price: i.price,
    }))
  );
  if (error) back(slug, 2, err(error.message));
  back(slug, 2, ok(`Đã thêm ${items.length} món vào "${categoryName}".`));
}

/** Bước 3: tạo khu vực + N bàn một lần ("Tầng 1, 8 bàn" → bàn 1–8). */
export async function addAreaWithTables(formData: FormData) {
  const slug = String(formData.get("slug"));
  const areaName = String(formData.get("area") ?? "").trim();
  const count = Math.floor(Number(formData.get("count")));
  if (!areaName) back(slug, 3, err("Cần tên khu vực."));
  if (!Number.isFinite(count) || count < 1 || count > 100) {
    back(slug, 3, err("Số bàn phải từ 1 đến 100."));
  }
  const tenantId = await tenantIdFromSlug(slug);
  if (!tenantId) redirect("/choose");
  const supabase = await createClient();

  const { data: area, error: areaErr } = await supabase
    .from("areas")
    .insert({ tenant_id: tenantId, name: areaName })
    .select("id")
    .single();
  if (areaErr) {
    back(
      slug, 3,
      err(
        /duplicate|unique/i.test(areaErr.message)
          ? `Khu vực "${areaName}" đã tồn tại — thêm bàn cho khu vực này ở trang "Khu vực & bàn".`
          : areaErr.message
      )
    );
  }

  const rows = Array.from({ length: count }, (_, i) => ({
    tenant_id: tenantId,
    area_id: area!.id,
    name: String(i + 1),
  }));
  const { error } = await supabase.from("tables").insert(rows);
  if (error) back(slug, 3, err(error.message));
  back(slug, 3, ok(`Đã tạo "${areaName}" với ${count} bàn.`));
}

/** Bước 4: đánh dấu đã mở trang in QR (checklist TENANT-03) rồi mở trang in. */
export async function openPrintPage(formData: FormData) {
  const slug = String(formData.get("slug"));
  const store = await cookies();
  store.set(`onb-printed-${slug}`, "1", { path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect(`/r/${slug}/admin/tables/print`);
}

/** "Để sau": tắt tự mở wizard, về trang quản trị. */
export async function dismissOnboarding(formData: FormData) {
  const slug = String(formData.get("slug"));
  const store = await cookies();
  store.set(`onb-skip-${slug}`, "1", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(`/r/${slug}/admin`);
}
