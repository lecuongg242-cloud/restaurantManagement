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
import { uploadImage, deleteMenuImage, duongDanAnh } from "@/lib/storage/images";
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

/**
 * Update bảng tenants + KIỂM đã ghi thật chưa. Supabase/PostgREST coi "khớp 0 dòng" là thành
 * công (error = null) nên nếu RLS/quyền cột chặn, action sẽ báo "Đã lưu" mà chẳng ghi gì —
 * chính lỗi đã làm logo/ảnh bìa mất im lặng trước 0020. `.select("id")` để đếm dòng đã đổi.
 */
async function updateTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  patch: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tenants")
    .update(patch)
    .eq("id", tenantId)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) {
    return "Không lưu được: thiếu quyền ghi trên nhà hàng này (kiểm RLS/quyền cột bảng tenants).";
  }
  return null;
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
  const failed = await updateTenant(supabase, session.tenant.id, {
    name,
    updated_at: new Date().toISOString(),
  });
  if (failed) redirect(`${back}${sep}error=${encodeURIComponent(failed)}`);

  revalidatePath(back, "layout");
  redirect(`${back}${sep}ok=${encodeURIComponent("Đã lưu tên nhà hàng")}`);
}

/**
 * Lưu nhận diện nhà hàng trong 1 lần: tên (bắt buộc) + logo/avatar + ảnh bìa (tùy chọn,
 * chỉ upload khi có tệp mới). Cập nhật TẠI CHỖ (useActionState) — không đổi link.
 */
export async function updateIdentity(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireSettingsManager(slug);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return setFlash("error", "Thiếu tên nhà hàng.");

  const supabase = await createClient();
  const update: {
    name: string;
    logo_url?: string;
    cover_url?: string;
    updated_at: string;
  } = { name, updated_at: new Date().toISOString() };

  // Chỉ đọc URL cũ khi thực sự có tệp mới (để dọn ảnh cũ khỏi Storage sau đó).
  const logoFile = formData.get("image");
  const coverFile = formData.get("cover");
  const hasLogo = logoFile instanceof File && logoFile.size > 0;
  const hasCover = coverFile instanceof File && coverFile.size > 0;

  let oldLogo: string | null = null;
  let oldCover: string | null = null;
  if (hasLogo || hasCover) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("logo_url, cover_url")
      .eq("id", session.tenant.id)
      .maybeSingle();
    oldLogo = tenant?.logo_url ?? null;
    oldCover = tenant?.cover_url ?? null;
  }

  if (hasLogo) {
    try {
      const { path } = await uploadImage(logoFile as File, session.tenant.id, "logo");
      update.logo_url = path;
    } catch (e) {
      return setFlash("error", e instanceof Error ? e.message : "Upload logo lỗi.");
    }
  }
  if (hasCover) {
    try {
      const { path } = await uploadImage(coverFile as File, session.tenant.id, "cover");
      update.cover_url = path;
    } catch (e) {
      return setFlash("error", e instanceof Error ? e.message : "Upload ảnh bìa lỗi.");
    }
  }

  const failed = await updateTenant(supabase, session.tenant.id, update);
  if (failed) return setFlash("error", failed);

  // Dọn ảnh cũ sau khi ghi DB thành công (không chặn luồng nếu xóa lỗi).
  if (update.logo_url) await deleteMenuImage(duongDanAnh(oldLogo));
  if (update.cover_url) await deleteMenuImage(duongDanAnh(oldCover));

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
    service_mode: formData.get("service_mode") === "counter" ? "counter" : "table",
  });

  const failed = await updateTenant(supabase, session.tenant.id, {
    settings: next,
    updated_at: new Date().toISOString(),
  });
  if (failed) return setFlash("error", failed);

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
    const { path } = await uploadImage(file as File, session.tenant.id, "logo");
    const failed = await updateTenant(supabase, session.tenant.id, {
      logo_url: path,
      updated_at: new Date().toISOString(),
    });
    if (failed) throw new Error(failed);
    await deleteMenuImage(duongDanAnh(tenant?.logo_url ?? null));
  } catch (e) {
    redirect(`${back}${sep}error=${encodeURIComponent(e instanceof Error ? e.message : "Upload logo lỗi.")}`);
  }

  revalidatePath(back, "layout");
  redirect(`${back}${sep}ok=${encodeURIComponent("Đã cập nhật logo")}`);
}
