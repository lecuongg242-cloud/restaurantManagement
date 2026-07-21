"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership, type Role } from "@/lib/auth/session";
import { canManageStaff } from "@/lib/auth/rbac";
import { hashPin, isValidPin } from "@/lib/auth/pin";

const PIN_ROLES: Role[] = ["cashier", "waiter", "kitchen"];

/** Guard chung: chỉ owner/manager của tenant theo slug được quản lý nhân viên. */
async function requireManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManageStaff(session.role)) {
    redirect(`/r/${slug}/admin/staff?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

/** Tạo nhân viên PIN-only (cashier/waiter/kitchen), user_id = NULL, pin_hash bcrypt. */
export async function createStaff(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);

  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const pin = String(formData.get("pin") ?? "");
  const back = `/r/${slug}/admin/staff`;
  const fail = (m: string) => redirect(`${back}?error=${encodeURIComponent(m)}`);

  if (!displayName) fail("Thiếu tên nhân viên.");
  if (!PIN_ROLES.includes(role)) fail("Vai trò phải là thu ngân / phục vụ / bếp.");
  if (!isValidPin(pin)) fail("PIN phải gồm đúng 4 chữ số.");

  const pin_hash = await hashPin(pin);

  const supabase = await createClient();
  const { error } = await supabase.from("memberships").insert({
    tenant_id: session.tenant.id,
    user_id: null, // PIN-only, không cấp tài khoản Supabase riêng
    role,
    display_name: displayName,
    pin_hash,
    active: true,
  });
  if (error) fail(`Không tạo được nhân viên: ${error.message}`);

  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent(`Đã thêm ${displayName}`)}`);
}

/** Đặt lại PIN cho một nhân viên. */
export async function resetPin(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);
  const id = String(formData.get("id") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const back = `/r/${slug}/admin/staff`;

  if (!isValidPin(pin)) redirect(`${back}?error=${encodeURIComponent("PIN phải 4 chữ số.")}`);
  const pin_hash = await hashPin(pin);

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ pin_hash })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(`${back}?ok=${encodeURIComponent("Đã đặt lại PIN")}`);
}

/** Bật/tắt nhân viên (giữ lịch sử thay vì xóa cứng). */
export async function setStaffActive(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  const back = `/r/${slug}/admin/staff`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .update({ active })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(back);
}

/** Xóa cứng một nhân viên PIN-only. */
export async function deleteStaff(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const session = await requireManager(slug);
  const id = String(formData.get("id") ?? "");
  const back = `/r/${slug}/admin/staff`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .is("user_id", null); // chỉ xóa nhân viên PIN-only, không đụng owner/station
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(back);
  redirect(back);
}
