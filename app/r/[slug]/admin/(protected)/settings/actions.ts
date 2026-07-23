"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import {
  parseSettings,
  serializeSettings,
  type TenantSettings,
} from "@/lib/tenant/settings";
import { uploadImage, deleteMenuImage, pathFromPublicUrl } from "@/lib/storage/images";
import { setFlash } from "@/lib/flash";

async function requireSettingsManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "settings")) {
    redirect(`/r/${slug}/admin/settings?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

function settingsPath(slug: string) {
  return `/r/${slug}/admin/settings`;
}

/** Đích redirect sau khi lưu: `redirect_to` (vd onboarding) hoặc trang settings. */
function backFor(slug: string, formData: FormData) {
  const to = String(formData.get("redirect_to") ?? "").trim();
  return to || settingsPath(slug);
}

/** Đổi tên hiển thị nhà hàng. */
export async function updateProfile(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireSettingsManager(slug);
  const name = String(formData.get("name") ?? "").trim();
  const back = backFor(slug, formData);
  const sep = back.includes("?") ? "&" : "?";
  if (!name) redirect(`${back}${sep}error=${encodeURIComponent("Thiếu tên nhà hàng.")}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", session.tenant.id);
  if (error) redirect(`${back}${sep}error=${encodeURIComponent(error.message)}`);

  revalidatePath(back, "layout");
  redirect(`${back}${sep}ok=${encodeURIComponent("Đã lưu tên nhà hàng")}`);
}

/**
 * Lưu nhận diện nhà hàng trong 1 lần: tên (bắt buộc) + logo (tùy chọn, chỉ upload
 * khi có tệp mới). Cập nhật TẠI CHỖ (useActionState) — không đổi link.
 */
export async function updateIdentity(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireSettingsManager(slug);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return setFlash("error", "Thiếu tên nhà hàng.");

  const supabase = await createClient();
  const update: { name: string; logo_url?: string; updated_at: string } = {
    name,
    updated_at: new Date().toISOString(),
  };

  // Logo tùy chọn: chỉ xử lý khi người dùng thực sự chọn tệp mới.
  const file = formData.get("image");
  let oldLogo: string | null = null;
  if (file instanceof File && file.size > 0) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("logo_url")
      .eq("id", session.tenant.id)
      .maybeSingle();
    oldLogo = tenant?.logo_url ?? null;
    try {
      const { publicUrl } = await uploadImage(file, session.tenant.id, "logo");
      update.logo_url = publicUrl;
    } catch (e) {
      return setFlash("error", e instanceof Error ? e.message : "Upload logo lỗi.");
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update(update)
    .eq("id", session.tenant.id);
  if (error) return setFlash("error", error.message);

  // Dọn logo cũ sau khi ghi DB thành công (không chặn luồng nếu xóa lỗi).
  if (update.logo_url) await deleteMenuImage(pathFromPublicUrl(oldLogo));

  revalidatePath(settingsPath(slug), "layout");
  await setFlash("ok", "Đã lưu nhận diện nhà hàng.");
}

/** Lưu cấu hình vận hành vào tenants.settings (merge + clamp). Cập nhật tại chỗ. */
export async function updateSettings(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireSettingsManager(slug);

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", session.tenant.id)
    .maybeSingle();

  const current = parseSettings(tenant?.settings);
  const next: TenantSettings = serializeSettings({
    ...current,
    service_charge_pct: Number(formData.get("service_charge_pct") ?? current.service_charge_pct),
    vat_pct: Number(formData.get("vat_pct") ?? current.vat_pct),
    receipt_footer: String(formData.get("receipt_footer") ?? current.receipt_footer),
    qr_order_auto_send: formData.get("qr_order_auto_send") === "on",
    allow_discount: formData.get("allow_discount") === "on",
  });

  const { error } = await supabase
    .from("tenants")
    .update({ settings: next, updated_at: new Date().toISOString() })
    .eq("id", session.tenant.id);
  if (error) return setFlash("error", error.message);

  revalidatePath(settingsPath(slug));
  await setFlash("ok", "Đã lưu cấu hình.");
}

/** Upload logo tenant vào menu-images/{tenant_id}/logo-{rand}; cập nhật logo_url. */
export async function uploadLogo(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireSettingsManager(slug);
  const back = backFor(slug, formData);
  const sep = back.includes("?") ? "&" : "?";
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    redirect(`${back}${sep}error=${encodeURIComponent("Chưa chọn tệp logo.")}`);
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("logo_url")
    .eq("id", session.tenant.id)
    .maybeSingle();

  try {
    const { publicUrl } = await uploadImage(file as File, session.tenant.id, "logo");
    const { error } = await supabase
      .from("tenants")
      .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", session.tenant.id);
    if (error) throw new Error(error.message);
    await deleteMenuImage(pathFromPublicUrl(tenant?.logo_url ?? null));
  } catch (e) {
    redirect(`${back}${sep}error=${encodeURIComponent(e instanceof Error ? e.message : "Upload logo lỗi.")}`);
  }

  revalidatePath(back, "layout");
  redirect(`${back}${sep}ok=${encodeURIComponent("Đã cập nhật logo")}`);
}
