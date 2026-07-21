"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";

async function requireMenuManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "menu")) {
    redirect(`/r/${slug}/admin/menu/modifiers?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

function modPath(slug: string) {
  return `/r/${slug}/admin/menu/modifiers`;
}

function readGroupFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const min_select = Math.max(0, parseInt(String(formData.get("min_select") ?? "0"), 10) || 0);
  const max_select = Math.max(0, parseInt(String(formData.get("max_select") ?? "1"), 10) || 0);
  const required = formData.get("required") === "on";
  return { name, min_select, max_select, required };
}

/** Kiểm ràng buộc nhóm: max>=min và required ⇒ min>=1. Trả thông báo lỗi hoặc null. */
function validateGroup(f: { min_select: number; max_select: number; required: boolean }): string | null {
  if (f.max_select < f.min_select) return "Số chọn tối đa phải ≥ số chọn tối thiểu.";
  if (f.required && f.min_select < 1) return "Nhóm bắt buộc phải có số chọn tối thiểu ≥ 1.";
  return null;
}

// ---- Nhóm tùy chọn ----------------------------------------------------------

export async function createGroup(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const back = modPath(slug);
  const f = readGroupFields(formData);
  if (!f.name) redirect(`${back}?error=${encodeURIComponent("Thiếu tên nhóm.")}`);
  const err = validateGroup(f);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("modifier_groups")
    .select("sort_order")
    .eq("tenant_id", session.tenant.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("modifier_groups").insert({
    tenant_id: session.tenant.id,
    name: f.name,
    min_select: f.min_select,
    max_select: f.max_select,
    required: f.required,
    sort_order,
  });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent(`Đã thêm nhóm "${f.name}"`)}`);
}

export async function updateGroup(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const back = modPath(slug);
  const f = readGroupFields(formData);
  if (!f.name) redirect(`${back}?error=${encodeURIComponent("Thiếu tên nhóm.")}`);
  const err = validateGroup(f);
  if (err) redirect(`${back}?error=${encodeURIComponent(err)}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("modifier_groups")
    .update({ ...f, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Đã lưu nhóm")}`);
}

export async function deleteGroup(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const back = modPath(slug);

  const supabase = await createClient();
  const { error } = await supabase
    .from("modifier_groups")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Đã xóa nhóm")}`);
}

// ---- Option -----------------------------------------------------------------

export async function addOption(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const group_id = String(formData.get("group_id") ?? "");
  const back = modPath(slug);
  const name = String(formData.get("name") ?? "").trim();
  const priceRaw = String(formData.get("price_delta") ?? "").replace(/[^\d]/g, "");
  const price_delta = priceRaw ? parseInt(priceRaw, 10) : 0;
  if (!name) redirect(`${back}?error=${encodeURIComponent("Thiếu tên tùy chọn.")}`);

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("modifier_options")
    .select("sort_order")
    .eq("tenant_id", session.tenant.id)
    .eq("group_id", group_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("modifier_options").insert({
    tenant_id: session.tenant.id,
    group_id,
    name,
    price_delta,
    sort_order,
  });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(back);
}

export async function updateOption(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const back = modPath(slug);
  const name = String(formData.get("name") ?? "").trim();
  const priceRaw = String(formData.get("price_delta") ?? "").replace(/[^\d]/g, "");
  const price_delta = priceRaw ? parseInt(priceRaw, 10) : 0;
  if (!name) redirect(`${back}?error=${encodeURIComponent("Thiếu tên tùy chọn.")}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("modifier_options")
    .update({ name, price_delta })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(back);
}

export async function deleteOption(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireMenuManager(slug);
  const id = String(formData.get("id") ?? "");
  const back = modPath(slug);

  const supabase = await createClient();
  const { error } = await supabase
    .from("modifier_options")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(back);
}

/** Bật/tắt "hết" cho một option (optimistic, không redirect). */
export async function setOptionAvailable(slug: string, id: string, available: boolean) {
  const session = await requireMenuManager(slug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("modifier_options")
    .update({ is_available: available })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) throw new Error(error.message);
  revalidatePath(modPath(slug));
}
